param(
    [switch]$ShowConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-TomlStringValue {
    param(
        [string[]]$Lines,
        [string]$Section,
        [string]$Key
    )

    $currentSection = ""
    $pattern = "^\s*" + [regex]::Escape($Key) + '\s*=\s*"([^"]*)"\s*$'

    foreach ($line in $Lines) {
        if ($line -match '^\s*\[(.+)\]\s*$') {
            $currentSection = $Matches[1]
            continue
        }

        if ($currentSection -ne $Section) {
            continue
        }

        if ($line -match $pattern) {
            return $Matches[1]
        }
    }

    return $null
}

function Get-JsonStringValue {
    param(
        [psobject]$Object,
        [string]$Key
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$Key]
    if ($null -eq $property) {
        return $null
    }

    return [string]$property.Value
}

function Get-EnvironmentValue {
    param([string]$Name)

    if ([string]::IsNullOrWhiteSpace($Name)) {
        return $null
    }

    $item = Get-Item -LiteralPath ("Env:{0}" -f $Name) -ErrorAction SilentlyContinue
    if ($null -eq $item) {
        return $null
    }

    return [string]$item.Value
}

function Get-FirstNonEmptyValue {
    param([object[]]$Candidates)

    foreach ($candidate in $Candidates) {
        if ($null -eq $candidate) {
            continue
        }

        $value = [string]$candidate
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    return $null
}

function Mask-Secret {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return "<empty>"
    }

    if ($Value.Length -le 10) {
        return ("*" * $Value.Length)
    }

    return "{0}...{1}" -f $Value.Substring(0, 6), $Value.Substring($Value.Length - 4)
}

$homeRoot = Get-FirstNonEmptyValue -Candidates @(
    $HOME,
    $env:USERPROFILE
)

if ([string]::IsNullOrWhiteSpace($homeRoot)) {
    throw "HOME and USERPROFILE are both unavailable, cannot resolve CODEX_HOME."
}

$codexHome = Get-FirstNonEmptyValue -Candidates @(
    (Get-EnvironmentValue -Name "CODEX_HOME"),
    (Join-Path -Path $homeRoot -ChildPath ".codex")
)

$authPath = Join-Path $codexHome "auth.json"
$configPath = Join-Path $codexHome "config.toml"
$imageGenScriptPath = Join-Path $codexHome "skills\.system\imagegen\scripts\image_gen.py"

foreach ($requiredPath in @($authPath, $configPath, $imageGenScriptPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required file not found: $requiredPath"
    }
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $pythonCommand) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
}

if ($null -eq $pythonCommand) {
    throw "Python was not found in PATH."
}

$configLines = Get-Content -LiteralPath $configPath
$authConfig = Get-Content -Raw -LiteralPath $authPath | ConvertFrom-Json

$imageGenKeyEnv = Get-FirstNonEmptyValue -Candidates @(
    (Get-TomlStringValue -Lines $configLines -Section "imagegen" -Key "api_key_env"),
    "OPENAI_API_KEY"
)

$resolvedApiKey = Get-FirstNonEmptyValue -Candidates @(
    (Get-EnvironmentValue -Name $imageGenKeyEnv),
    (Get-EnvironmentValue -Name "OPENAI_API_KEY"),
    (Get-JsonStringValue -Object $authConfig -Key $imageGenKeyEnv),
    (Get-JsonStringValue -Object $authConfig -Key "OPENAI_API_KEY")
)

if ([string]::IsNullOrWhiteSpace($resolvedApiKey)) {
    throw "No API key found in environment variables or $authPath."
}

$resolvedBaseUrl = Get-FirstNonEmptyValue -Candidates @(
    (Get-EnvironmentValue -Name "OPENAI_BASE_URL"),
    (Get-TomlStringValue -Lines $configLines -Section "imagegen" -Key "base_url"),
    (Get-TomlStringValue -Lines $configLines -Section "model_providers.OpenAI" -Key "base_url")
)

$resolvedModel = Get-FirstNonEmptyValue -Candidates @(
    (Get-TomlStringValue -Lines $configLines -Section "imagegen" -Key "model"),
    "gpt-image-2"
)

$env:CODEX_HOME = $codexHome
$env:OPENAI_API_KEY = $resolvedApiKey
Set-Item -LiteralPath ("Env:{0}" -f $imageGenKeyEnv) -Value $resolvedApiKey

if (-not [string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
    $env:OPENAI_BASE_URL = $resolvedBaseUrl
}

if ($ShowConfig) {
    Write-Host ("CODEX_HOME     : {0}" -f $codexHome)
    Write-Host ("Auth file      : {0}" -f $authPath)
    Write-Host ("Config file    : {0}" -f $configPath)
    Write-Host ("ImageGen script: {0}" -f $imageGenScriptPath)
    Write-Host ("Python         : {0}" -f $pythonCommand.Source)
    Write-Host ("Model          : {0}" -f $resolvedModel)
    Write-Host ("API key env    : {0}" -f $imageGenKeyEnv)
    Write-Host ("API key        : {0}" -f (Mask-Secret -Value $resolvedApiKey))
    Write-Host ("Base URL       : {0}" -f (Get-FirstNonEmptyValue -Candidates @($resolvedBaseUrl, "<unset>")))
}

$runArgs = $args
if ($null -eq $runArgs -or $runArgs.Count -eq 0) {
    $runArgs = @("--help")
}

& $pythonCommand.Source $imageGenScriptPath @runArgs
exit $LASTEXITCODE
