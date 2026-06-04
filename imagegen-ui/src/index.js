// ImageGen Desktop Studio Frontend Controller

// State variables
let activeTab = 'tab-generate';
let activeConfig = {};
let generatedImages = []; // Array of { path, prompt, model, size }
let taskTimer = null; // 运行计时器
let taskStartTime = 0; // 任务开始时间戳

// Canvas drawing state for Edit tab
let sourceImageBytes = null;
let sourceImageName = '';
let uploadedMaskPath = '';
let drawHistory = [];
let isDrawing = false;
let toolMode = 'brush'; // 'brush' or 'eraser'
let lastX = 0;
let lastY = 0;

// DOM Elements
const elements = {
  // Tabs
  tabButtons: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  
  // Credentials
  apiKeyInput: document.getElementById('apikey-override'),
  togglePasswordBtn: document.querySelector('.toggle-password'),
  baseUrlInput: document.getElementById('baseurl-override'),
  btnRefreshConfig: document.getElementById('btn-refresh-config'),
  
  // Sidebar parameters
  paramModel: document.getElementById('param-model'),
  paramSize: document.getElementById('param-size'),
  paramQuality: document.getElementById('param-quality'),
  paramBackground: document.getElementById('param-background'),
  paramFormat: document.getElementById('param-format'),
  paramN: document.getElementById('param-n'),
  valN: document.getElementById('val-n'),
  compressionControl: document.getElementById('compression-control'),
  paramCompression: document.getElementById('param-compression'),
  valCompression: document.getElementById('val-compression'),
  
  // Augmentation hints
  paramAugment: document.getElementById('param-augment'),
  augmentFields: document.getElementById('augment-fields'),
  hintUseCase: document.getElementById('hint-use-case'),
  hintSubject: document.getElementById('hint-subject'),
  hintScene: document.getElementById('hint-scene'),
  hintStyle: document.getElementById('hint-style'),
  hintComposition: document.getElementById('hint-composition'),
  hintLighting: document.getElementById('hint-lighting'),
  hintPalette: document.getElementById('hint-palette'),
  hintMaterials: document.getElementById('hint-materials'),
  hintText: document.getElementById('hint-text'),
  hintConstraints: document.getElementById('hint-constraints'),
  hintNegative: document.getElementById('hint-negative'),
  
  // Advanced flags
  paramDownscale: document.getElementById('param-downscale'),
  paramDownscaleSuffix: document.getElementById('param-downscale-suffix'),
  paramDryrun: document.getElementById('param-dryrun'),
  paramForce: document.getElementById('param-force'),
  
  // Generate Tab
  promptGenerate: document.getElementById('prompt-generate'),
  outGenerate: document.getElementById('out-generate'),
  btnBrowseGenerate: document.getElementById('btn-browse-generate'),
  btnGenerate: document.getElementById('btn-generate'),
  
  // Edit Tab (Canvas & Inputs)
  editDropzone: document.getElementById('edit-dropzone'),
  canvasWorkspace: document.getElementById('canvas-workspace'),
  bgCanvas: document.getElementById('bg-canvas'),
  paintCanvas: document.getElementById('paint-canvas'),
  toolBrush: document.getElementById('tool-brush'),
  toolEraser: document.getElementById('tool-eraser'),
  brushSize: document.getElementById('brush-size'),
  brushSizeVal: document.getElementById('brush-size-val'),
  btnClearMask: document.getElementById('btn-clear-mask'),
  btnChangeImage: document.getElementById('btn-change-image'),
  promptEdit: document.getElementById('prompt-edit'),
  paramFidelity: document.getElementById('param-fidelity'),
  btnBrowseMask: document.getElementById('btn-browse-mask'),
  maskPathDisplay: document.getElementById('mask-path-display'),
  btnClearUploadedMask: document.getElementById('btn-clear-uploaded-mask'),
  outEdit: document.getElementById('out-edit'),
  btnBrowseEditOut: document.getElementById('btn-browse-edit-out'),
  btnEdit: document.getElementById('btn-edit'),
  
  // Batch Tab
  modeBatchText: document.getElementById('mode-batch-text'),
  modeBatchFile: document.getElementById('mode-batch-file'),
  batchEditorArea: document.getElementById('batch-editor-area'),
  batchFileArea: document.getElementById('batch-file-area'),
  batchJsonlText: document.getElementById('batch-jsonl-text'),
  batchFilePath: document.getElementById('batch-file-path'),
  btnBrowseBatchFile: document.getElementById('btn-browse-batch-file'),
  batchOutDir: document.getElementById('batch-out-dir'),
  btnBrowseBatchDir: document.getElementById('btn-browse-batch-dir'),
  batchConcurrency: document.getElementById('batch-concurrency'),
  valConcurrency: document.getElementById('val-concurrency'),
  batchAttempts: document.getElementById('batch-attempts'),
  valAttempts: document.getElementById('val-attempts'),
  batchFailfast: document.getElementById('batch-failfast'),
  btnBatchGenerate: document.getElementById('btn-batch-generate'),
  
  // Console
  execStatus: document.getElementById('exec-status'),
  consoleOutput: document.getElementById('console-output'),
  consoleAutoscroll: document.getElementById('console-autoscroll'),
  btnClearConsole: document.getElementById('btn-clear-console'),
  btnCopyConsole: document.getElementById('btn-copy-console'),
  
  // Gallery
  galleryEmpty: document.getElementById('gallery-empty'),
  galleryGrid: document.getElementById('gallery-grid'),
  
  // Lightbox
  lightboxModal: document.getElementById('lightbox-modal'),
  lightboxImg: document.getElementById('lightbox-img'),
  infoPrompt: document.getElementById('info-prompt'),
  infoModel: document.getElementById('info-model'),
  infoSize: document.getElementById('info-size'),
  infoPath: document.getElementById('info-path'),
  btnLightboxClose: document.getElementById('btn-lightbox-close'),
  btnOpenImage: document.getElementById('btn-open-image'),
  btnShowFolder: document.getElementById('btn-show-folder'),
};

// Generate a unique output file path with a timestamp to prevent overwrites
function generateTimestampedPath(prefix = 'output') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `output/imagegen/${prefix}_${year}${month}${day}_${hours}${minutes}${seconds}.png`;
}

// Update output fields with timestamped paths if they are empty or still using default prefix format
function updatePathsIfDefault() {
  const genVal = elements.outGenerate.value ? elements.outGenerate.value.trim() : '';
  if (!genVal || (genVal.startsWith('output/imagegen/output_') && genVal.endsWith('.png')) || genVal === 'output/imagegen/output.png') {
    elements.outGenerate.value = generateTimestampedPath('output');
  }

  const editVal = elements.outEdit.value ? elements.outEdit.value.trim() : '';
  if (!editVal || (editVal.startsWith('output/imagegen/output_edited_') && editVal.endsWith('.png')) || editVal === 'output/imagegen/output.png') {
    elements.outEdit.value = generateTimestampedPath('output_edited');
  }
}

// Initialize app on load
window.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initSliders();
  initFormControls();
  initConsole();
  initCanvasDrawing();
  initDropzone();
  initLightbox();
  
  // Set default timestamped output paths
  updatePathsIfDefault();

  // Load configuration from local script config files
  try {
    await refreshConfiguration();
  } catch (err) {
    logError(`加载系统配置出错: ${err.message}`);
  }

  // Initialize policy modal handlers
  initPolicyModal();

  // Listen to application menu config refresh events
  if (window.api && window.api.onMenuRefresh) {
    window.api.onMenuRefresh(async () => {
      logSystem('从应用菜单收到刷新指令，正在重新载入配置...');
      try {
        await refreshConfiguration();
      } catch (err) {
        logError(`重载配置失败: ${err.message}`);
      }
    });
  }

  // Listen to policy modal trigger from menu bar
  if (window.api && window.api.onShowPolicyModal) {
    window.api.onShowPolicyModal(() => {
      openPolicyModal();
    });
  }
});

// Load config from PowerShell
async function refreshConfiguration() {
  logSystem('正在读取系统 ImageGen 默认配置...');
  const res = await window.api.loadConfig();
  if (res.success) {
    activeConfig = res.config;
    logSystem(`读取配置成功！使用模型: ${res.config.model || '未设定'}`);
    
    // Autofill defaults if available
    if (res.config.model) {
      elements.paramModel.value = res.config.model;
    }
    if (res.config.base_url) {
      elements.baseUrlInput.placeholder = `默认: ${res.config.base_url}`;
    }
    if (res.config.api_key_env) {
      elements.apiKeyInput.placeholder = `默认环境变量: ${res.config.api_key_env}`;
    }
  } else {
    logError(`读取配置失败: ${res.error}`);
  }
}

// ----------------------------------------------------
// TAB NAVIGATION
// ----------------------------------------------------
function initTabs() {
  elements.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.tabButtons.forEach(b => b.classList.remove('active'));
      elements.tabPanes.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      activeTab = btn.getAttribute('data-tab');
      document.getElementById(activeTab).classList.add('active');
      
      logSystem(`已切换至: ${btn.textContent.trim()}`);
    });
  });
}

// ----------------------------------------------------
// SLIDERS & FORM BINDINGS
// ----------------------------------------------------
function initSliders() {
  // Image count slider
  elements.paramN.addEventListener('input', () => {
    elements.valN.textContent = elements.paramN.value;
  });
  
  // Compression slider (depends on format choice)
  elements.paramFormat.addEventListener('change', () => {
    const format = elements.paramFormat.value;
    if (format === 'jpeg' || format === 'webp') {
      elements.compressionControl.style.opacity = '1';
      elements.compressionControl.style.pointerEvents = 'auto';
      elements.paramCompression.disabled = false;
      elements.valCompression.textContent = `${elements.paramCompression.value}%`;
    } else {
      elements.compressionControl.style.opacity = '0.5';
      elements.compressionControl.style.pointerEvents = 'none';
      elements.paramCompression.disabled = true;
      elements.valCompression.textContent = '无 (PNG)';
    }
  });
  
  elements.paramCompression.addEventListener('input', () => {
    elements.valCompression.textContent = `${elements.paramCompression.value}%`;
  });
  
  // Batch Concurrency
  elements.batchConcurrency.addEventListener('input', () => {
    elements.valConcurrency.textContent = elements.batchConcurrency.value;
  });
  
  // Batch Max Attempts
  elements.batchAttempts.addEventListener('input', () => {
    elements.valAttempts.textContent = elements.batchAttempts.value;
  });
}

function initFormControls() {
  // Password override show/hide toggle
  elements.togglePasswordBtn.addEventListener('click', () => {
    const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
    elements.apiKeyInput.type = type;
  });
  
  // Refresh config button
  elements.btnRefreshConfig.addEventListener('click', async () => {
    await refreshConfiguration();
  });
  
  // Augment fields toggle
  elements.paramAugment.addEventListener('change', () => {
    const enabled = elements.paramAugment.checked;
    elements.augmentFields.style.opacity = enabled ? '1' : '0.4';
    elements.augmentFields.style.pointerEvents = enabled ? 'auto' : 'none';
  });

  // Native Browse Buttons bindings
  elements.btnBrowseGenerate.addEventListener('click', async () => {
    const res = await window.api.showSaveDialog({
      title: '选择生成图像保存路径',
      defaultPath: 'output.png'
    });
    if (!res.canceled && res.filePath) {
      elements.outGenerate.value = res.filePath;
    }
  });

  elements.btnBrowseEditOut.addEventListener('click', async () => {
    const res = await window.api.showSaveDialog({
      title: '选择编辑图像保存路径',
      defaultPath: 'output_edited.png'
    });
    if (!res.canceled && res.filePath) {
      elements.outEdit.value = res.filePath;
    }
  });

  elements.btnBrowseMask.addEventListener('click', async () => {
    const res = await window.api.showOpenDialog({
      title: '选择本地黑白蒙版图片',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (!res.canceled && res.filePaths.length > 0) {
      uploadedMaskPath = res.filePaths[0];
      elements.maskPathDisplay.value = uploadedMaskPath;
      elements.btnClearUploadedMask.style.display = 'block';
      logSystem(`已选择外部蒙版文件: ${uploadedMaskPath}`);
    }
  });

  elements.btnClearUploadedMask.addEventListener('click', () => {
    uploadedMaskPath = '';
    elements.maskPathDisplay.value = '';
    elements.btnClearUploadedMask.style.display = 'none';
    logSystem('已清除外部蒙版文件，优先使用画板手绘蒙版。');
  });

  // Batch Mode views
  elements.modeBatchText.addEventListener('click', () => {
    elements.modeBatchText.classList.add('active');
    elements.modeBatchFile.classList.remove('active');
    elements.batchEditorArea.style.display = 'flex';
    elements.batchFileArea.style.display = 'none';
  });

  elements.modeBatchFile.addEventListener('click', () => {
    elements.modeBatchFile.classList.add('active');
    elements.modeBatchText.classList.remove('active');
    elements.batchFileArea.style.display = 'flex';
    elements.batchEditorArea.style.display = 'none';
  });

  elements.btnBrowseBatchFile.addEventListener('click', async () => {
    const res = await window.api.showOpenDialog({
      title: '选择批量任务 JSONL 配置文件',
      filters: [{ name: 'JSON Lines', extensions: ['jsonl', 'txt'] }]
    });
    if (!res.canceled && res.filePaths.length > 0) {
      elements.batchFilePath.value = res.filePaths[0];
    }
  });

  elements.btnBrowseBatchDir.addEventListener('click', async () => {
    const res = await window.api.showOpenDialog({
      title: '选择图像输出保存文件夹',
      properties: ['openDirectory']
    });
    if (!res.canceled && res.filePaths.length > 0) {
      elements.batchOutDir.value = res.filePaths[0];
    }
  });
  
  // Run Action Buttons
  elements.btnGenerate.addEventListener('click', () => handleRunGenerate());
  elements.btnEdit.addEventListener('click', () => handleRunEdit());
  elements.btnBatchGenerate.addEventListener('click', () => handleRunBatch());
}

// ----------------------------------------------------
// REAL-TIME CONSOLE LOGGER
// ----------------------------------------------------
function initConsole() {
  elements.btnClearConsole.addEventListener('click', () => {
    elements.consoleOutput.innerHTML = '';
  });

  elements.btnCopyConsole.addEventListener('click', () => {
    const text = elements.consoleOutput.innerText;
    navigator.clipboard.writeText(text);
    logSystem('控制台日志已复制到剪贴板！');
  });

  // 取消按钮
  const cancelBtn = document.getElementById('btn-cancel-task');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      logSystem('正在取消当前任务...');
      await window.api.cancelImageGen();
    });
  }

  // Register real-time log listener
  window.api.onLog((data) => {
    appendLogLine(data.text, data.type);
  });
}

function logSystem(text) {
  appendLogLine(`[System] ${text}`, 'system');
}

function logError(text) {
  appendLogLine(`[Error] ${text}`, 'error');
}

function appendLogLine(text, type = 'stdout') {
  const line = document.createElement('div');
  line.classList.add('console-line');
  
  if (type === 'system') line.classList.add('system-line');
  else if (type === 'stderr') line.classList.add('stderr-line');
  else if (type === 'error') line.classList.add('error-line');
  else line.classList.add('stdout-line');
  
  line.innerText = text;
  elements.consoleOutput.appendChild(line);
  
  // Limit output lines to 2000 to prevent performance degradation
  while (elements.consoleOutput.childNodes.length > 2000) {
    elements.consoleOutput.removeChild(elements.consoleOutput.firstChild);
  }
  
  if (elements.consoleAutoscroll.checked) {
    elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;
  }
}

function setExecutionStatus(running) {
  if (running) {
    elements.execStatus.className = 'status-indicator running';
    elements.btnGenerate.disabled = true;
    elements.btnGenerate.classList.add('loading');
    elements.btnEdit.disabled = true;
    elements.btnEdit.classList.add('loading');
    elements.btnBatchGenerate.disabled = true;
    elements.btnBatchGenerate.classList.add('loading');
    // 显示取消按钮
    const cancelBtn = document.getElementById('btn-cancel-task');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    // 启动计时器
    taskStartTime = Date.now();
    updateTimerDisplay();
    taskTimer = setInterval(updateTimerDisplay, 1000);
  } else {
    elements.execStatus.className = 'status-indicator idle';
    elements.btnGenerate.disabled = false;
    elements.btnGenerate.classList.remove('loading');
    elements.btnEdit.disabled = false;
    elements.btnEdit.classList.remove('loading');
    elements.btnBatchGenerate.disabled = false;
    elements.btnBatchGenerate.classList.remove('loading');
    // 隐藏取消按钮
    const cancelBtn = document.getElementById('btn-cancel-task');
    if (cancelBtn) cancelBtn.style.display = 'none';
    // 停止计时器
    if (taskTimer) {
      clearInterval(taskTimer);
      taskTimer = null;
    }
    const timerEl = document.getElementById('task-timer');
    if (timerEl) timerEl.textContent = '';
  }
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('task-timer');
  if (!timerEl) return;
  const elapsed = Math.floor((Date.now() - taskStartTime) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  const text = min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
  timerEl.textContent = `⏱ 已运行 ${text}`;
  if (elapsed > 300) {
    timerEl.className = 'task-timer timer-danger';
  } else if (elapsed > 60) {
    timerEl.className = 'task-timer timer-warning';
  } else {
    timerEl.className = 'task-timer';
  }
}

// ----------------------------------------------------
// SCRIPT ARGUMENTS COMPILER
// ----------------------------------------------------
function buildSharedArgs() {
  const args = [];
  
  // Model
  args.push('--model', elements.paramModel.value);
  
  // Quality
  args.push('--quality', elements.paramQuality.value);
  
  // Size
  args.push('--size', elements.paramSize.value);
  
  // Background
  args.push('--background', elements.paramBackground.value);
  
  // Format
  args.push('--output-format', elements.paramFormat.value);
  
  // Compression (only if format is jpeg or webp)
  const format = elements.paramFormat.value;
  if ((format === 'jpeg' || format === 'webp') && elements.paramCompression.value) {
    args.push('--output-compression', elements.paramCompression.value);
  }
  
  // Number of images
  args.push('--n', elements.paramN.value);
  
  // Post-processing downscale
  if (elements.paramDownscale.value) {
    args.push('--downscale-max-dim', elements.paramDownscale.value);
    if (elements.paramDownscaleSuffix.value) {
      args.push('--downscale-suffix', elements.paramDownscaleSuffix.value);
    }
  }
  
  // Dry run
  if (elements.paramDryrun.checked) {
    args.push('--dry-run');
  }
  
  // Force overwrite
  if (elements.paramForce.checked) {
    args.push('--force');
  }
  
  // Augment logic
  if (elements.paramAugment.checked) {
    args.push('--augment');
    // Gather hints
    if (elements.hintUseCase.value) args.push('--use-case', elements.hintUseCase.value);
    if (elements.hintSubject.value) args.push('--subject', elements.hintSubject.value);
    if (elements.hintScene.value) args.push('--scene', elements.hintScene.value);
    if (elements.hintStyle.value) args.push('--style', elements.hintStyle.value);
    if (elements.hintComposition.value) args.push('--composition', elements.hintComposition.value);
    if (elements.hintLighting.value) args.push('--lighting', elements.hintLighting.value);
    if (elements.hintPalette.value) args.push('--palette', elements.hintPalette.value);
    if (elements.hintMaterials.value) args.push('--materials', elements.hintMaterials.value);
    if (elements.hintText.value) args.push('--text', elements.hintText.value);
    if (elements.hintConstraints.value) args.push('--constraints', elements.hintConstraints.value);
    if (elements.hintNegative.value) args.push('--negative', elements.hintNegative.value);
  } else {
    args.push('--no-augment');
  }
  
  return args;
}

function getEnvOverrides() {
  const envs = {};
  if (elements.apiKeyInput.value.trim()) {
    envs['OPENAI_API_KEY'] = elements.apiKeyInput.value.trim();
  }
  if (elements.baseUrlInput.value.trim()) {
    envs['OPENAI_BASE_URL'] = elements.baseUrlInput.value.trim();
  }
  return envs;
}

// ----------------------------------------------------
// RUN GENERATE (TEXT TO IMAGE)
// ----------------------------------------------------
async function handleRunGenerate() {
  const prompt = elements.promptGenerate.value.trim();
  if (!prompt) {
    logError('提示词不能为空！');
    return;
  }
  
  setExecutionStatus(true);
  logSystem('正在启动文本生成任务...');
  
  const args = ['generate'];
  
  // Prompt
  args.push('--prompt', prompt);
  
  // Output path override
  let outPath = elements.outGenerate.value.trim();
  if (!outPath) {
    outPath = generateTimestampedPath('output');
    elements.outGenerate.value = outPath;
  }
  args.push('--out', outPath);
  
  // Shared arguments
  const shared = buildSharedArgs();
  args.push(...shared);
  
  const envs = getEnvOverrides();
  
  logSystem(`正在调用底层脚本，参数: ${args.join(' ')}`);
  
  try {
    const res = await window.api.runImageGen(args, envs);

    if (res.code === -2) {
      logError('任务被取消。');
    } else {
      logSystem(`任务执行结束，退出码: ${res.code}`);
    }

    // 优先使用后端解析到的实际输出路径
    if (res.code === 0 && !elements.paramDryrun.checked) {
      const paths = res.outputPaths && res.outputPaths.length > 0 ? res.outputPaths : [outPath];
      for (const p of paths) {
        await addImageToGallery(p, prompt, elements.paramModel.value, elements.paramSize.value);
      }
      updatePathsIfDefault();
    }
  } catch (err) {
    logError(`发生未知错误: ${err.message}`);
  } finally {
    setExecutionStatus(false);
  }
}

// ----------------------------------------------------
// RUN EDIT (IMAGE TO IMAGE / INPAINT)
// ----------------------------------------------------
async function handleRunEdit() {
  if (!sourceImageBytes) {
    logError('必须先上传底图才能进行图像编辑！');
    return;
  }
  
  const prompt = elements.promptEdit.value.trim();
  if (!prompt) {
    logError('编辑描述提示词不能为空！');
    return;
  }
  
  setExecutionStatus(true);
  logSystem('正在准备局部修改文件...');
  
  try {
    // 1. Save original image to a temp location
    const origRes = await window.api.saveTempFile(sourceImageName, sourceImageBytes);
    if (!origRes.success) {
      logError(`保存临时原图失败: ${origRes.error}`);
      setExecutionStatus(false);
      return;
    }
    const tempOriginalPath = origRes.filePath;
    
    // 2. Resolve mask
    let tempMaskPath = '';
    if (uploadedMaskPath) {
      // Use manually uploaded mask file
      tempMaskPath = uploadedMaskPath;
      logSystem(`使用已上传的蒙版文件: ${tempMaskPath}`);
    } else {
      // Compile hand-painted canvas to transparency mask PNG (where unpainted opaque area = white, painted target edit area = transparent)
      logSystem('生成画板涂鸦蒙版图像...');
      const maskArrayBuffer = compilePaintCanvasToMaskBuffer();
      const maskFileName = `mask_${Date.now()}.png`;
      
      const maskRes = await window.api.saveTempFile(maskFileName, maskArrayBuffer);
      if (!maskRes.success) {
        logError(`保存临时蒙版失败: ${maskRes.error}`);
        setExecutionStatus(false);
        return;
      }
      tempMaskPath = maskRes.filePath;
      logSystem(`成功导出涂鸦蒙版: ${tempMaskPath}`);
    }
    
    // 3. Assemble arguments
    const args = ['edit'];
    args.push('--image', tempOriginalPath);
    
    if (tempMaskPath) {
      args.push('--mask', tempMaskPath);
    }
    
    const fidelity = elements.paramFidelity.value;
    if (fidelity) {
      args.push('--input-fidelity', fidelity);
    }
    
    args.push('--prompt', prompt);
    
    let outPath = elements.outEdit.value.trim();
    if (!outPath) {
      outPath = generateTimestampedPath('output_edited');
      elements.outEdit.value = outPath;
    }
    args.push('--out', outPath);
    
    // Shared args
    const shared = buildSharedArgs();
    args.push(...shared);
    
    const envs = getEnvOverrides();
    
    logSystem(`启动局部编辑任务，参数: ${args.join(' ')}`);
    
    const res = await window.api.runImageGen(args, envs);

    if (res.code === -2) {
      logError('任务被取消。');
    } else {
      logSystem(`任务执行结束，退出码: ${res.code}`);
    }

    if (res.code === 0 && !elements.paramDryrun.checked) {
      const paths = res.outputPaths && res.outputPaths.length > 0 ? res.outputPaths : [outPath];
      for (const p of paths) {
        await addImageToGallery(p, prompt, elements.paramModel.value, elements.paramSize.value);
      }
      updatePathsIfDefault();
    }
  } catch (err) {
    logError(`编辑操作出现意外异常: ${err.message}`);
  } finally {
    setExecutionStatus(false);
    window.api.cleanupTempFiles();
  }
}

// ----------------------------------------------------
// RUN BATCH GENERATE
// ----------------------------------------------------
async function handleRunBatch() {
  const isTextMode = elements.modeBatchText.classList.contains('active');
  const outDir = elements.batchOutDir.value.trim();
  
  if (!outDir) {
    logError('批量生成时，输出目录为必填项！');
    return;
  }
  
  setExecutionStatus(true);
  logSystem('正在准备批量生成任务...');
  
  try {
    let jsonlPath = '';
    
    if (isTextMode) {
      // Get JSONL from textarea editor, write to a temp file
      const rawText = elements.batchJsonlText.value.trim();
      if (!rawText) {
        logError('JSONL 任务文本不能为空！');
        setExecutionStatus(false);
        return;
      }
      
      const encoder = new TextEncoder();
      const bytes = encoder.encode(rawText);
      const tempBatchFileName = `batch_job_${Date.now()}.jsonl`;
      const saveRes = await window.api.saveTempFile(tempBatchFileName, bytes.buffer);
      if (!saveRes.success) {
        logError(`无法写入临时批量脚本文件: ${saveRes.error}`);
        setExecutionStatus(false);
        return;
      }
      jsonlPath = saveRes.filePath;
      logSystem(`已将输入文本保存至临时 JSONL 文件: ${jsonlPath}`);
    } else {
      // Use selected local file
      jsonlPath = elements.batchFilePath.value.trim();
      if (!jsonlPath) {
        logError('必须先选择一个有效的本地 JSONL 配置文件！');
        setExecutionStatus(false);
        return;
      }
      logSystem(`读取本地批量任务文件: ${jsonlPath}`);
    }
    
    const args = ['generate-batch'];
    args.push('--input', jsonlPath);
    args.push('--out-dir', outDir);
    args.push('--concurrency', elements.batchConcurrency.value);
    args.push('--max-attempts', elements.batchAttempts.value);
    
    if (elements.batchFailfast.checked) {
      args.push('--fail-fast');
    }
    
    // Shared args
    const shared = buildSharedArgs();
    args.push(...shared);
    
    const envs = getEnvOverrides();
    
    logSystem(`启动批量并发生成，参数: ${args.join(' ')}`);
    
    const res = await window.api.runImageGen(args, envs);

    if (res.code === -2) {
      logError('任务被取消。');
    } else {
      logSystem(`批量并发生成任务结束，退出码: ${res.code}`);
    }
  } catch (err) {
    logError(`批量运行抛出异常: ${err.message}`);
  } finally {
    setExecutionStatus(false);
  }
}

// ----------------------------------------------------
// CANVAS PAINT MASK LOGIC
// ----------------------------------------------------
function initCanvasDrawing() {
  const bgCtx = elements.bgCanvas.getContext('2d');
  const paintCtx = elements.paintCanvas.getContext('2d');
  
  // Sync size label
  elements.brushSize.addEventListener('input', () => {
    elements.brushSizeVal.textContent = `${elements.brushSize.value}px`;
  });
  
  // Tool buttons toggle
  elements.toolBrush.addEventListener('click', () => {
    toolMode = 'brush';
    elements.toolBrush.classList.add('active');
    elements.toolEraser.classList.remove('active');
  });
  
  elements.toolEraser.addEventListener('click', () => {
    toolMode = 'eraser';
    elements.toolEraser.classList.add('active');
    elements.toolBrush.classList.remove('active');
  });
  
  elements.btnClearMask.addEventListener('click', () => {
    clearMaskCanvas();
    logSystem('画板蒙版已重置。');
  });
  
  elements.btnChangeImage.addEventListener('click', () => {
    // Reset Edit panel state
    sourceImageBytes = null;
    sourceImageName = '';
    elements.canvasWorkspace.style.display = 'none';
    elements.editDropzone.style.display = 'flex';
    clearMaskCanvas();
  });
  
  // Canvas mouse events
  const startDrawing = (e) => {
    isDrawing = true;
    const rect = elements.paintCanvas.getBoundingClientRect();
    
    // Convert client coordinates to canvas coordinates (since canvases are scaled on screen)
    const scaleX = elements.paintCanvas.width / rect.width;
    const scaleY = elements.paintCanvas.height / rect.height;
    
    lastX = (e.clientX - rect.left) * scaleX;
    lastY = (e.clientY - rect.top) * scaleY;
  };
  
  const draw = (e) => {
    if (!isDrawing) return;
    const rect = elements.paintCanvas.getBoundingClientRect();
    const scaleX = elements.paintCanvas.width / rect.width;
    const scaleY = elements.paintCanvas.height / rect.height;
    const currX = (e.clientX - rect.left) * scaleX;
    const currY = (e.clientY - rect.top) * scaleY;
    
    paintCtx.beginPath();
    paintCtx.moveTo(lastX, lastY);
    paintCtx.lineTo(currX, currY);
    
    // Set drawing styles
    paintCtx.lineWidth = parseInt(elements.brushSize.value);
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
    
    if (toolMode === 'brush') {
      paintCtx.globalCompositeOperation = 'source-over';
      paintCtx.strokeStyle = '#a855f7'; // Show semi-transparent purple visual feedback
    } else {
      // Eraser removes painted pixels
      paintCtx.globalCompositeOperation = 'destination-out';
      paintCtx.strokeStyle = 'rgba(0,0,0,1)';
    }
    
    paintCtx.stroke();
    
    lastX = currX;
    lastY = currY;
  };
  
  const stopDrawing = () => {
    isDrawing = false;
  };
  
  elements.paintCanvas.addEventListener('mousedown', startDrawing);
  elements.paintCanvas.addEventListener('mousemove', draw);
  elements.paintCanvas.addEventListener('mouseup', stopDrawing);
  elements.paintCanvas.addEventListener('mouseleave', stopDrawing);
}

function clearMaskCanvas() {
  const ctx = elements.paintCanvas.getContext('2d');
  ctx.clearRect(0, 0, elements.paintCanvas.width, elements.paintCanvas.height);
}

// Convert the paint strokes to a valid transparent PNG mask where:
// - Painted strokes (the areas we want to edit) = transparent (alpha = 0)
// - Unpainted background (the areas to preserve) = opaque white (alpha = 255)
function compilePaintCanvasToMaskBuffer() {
  const width = elements.paintCanvas.width;
  const height = elements.paintCanvas.height;
  
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d');
  
  // 1. Fill offscreen with solid white (opaque)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  
  // 2. Draw user strokes on it with destination-out to carve holes (making painted areas transparent)
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // We need to re-draw the strokes painted on paintCanvas.
  // Actually, paintCanvas is currently filled with transparent background and violet strokes.
  // Since we drew transparently using source-over, we can just copy paintCanvas pixels to carve holes!
  // Any pixel in paintCanvas with alpha > 0 should become transparent in offscreen.
  // Using destination-out with the paintCanvas image directly is perfect:
  ctx.drawImage(elements.paintCanvas, 0, 0);
  
  // Export offscreen canvas to binary buffer
  const dataUrl = offscreen.toDataURL('image/png');
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
  
  // Convert base64 to ArrayBuffer
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}

// ----------------------------------------------------
// DROPZONE LOGIC
// ----------------------------------------------------
function initDropzone() {
  const dropzone = elements.editDropzone;
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleEditFileSelected(files[0]);
    }
  });
  
  dropzone.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) {
        handleEditFileSelected(e.target.files[0]);
      }
    };
    fileInput.click();
  });
}

function handleEditFileSelected(file) {
  if (!file.type.startsWith('image/')) {
    logError('选中的文件不是有效图片格式！');
    return;
  }
  
  logSystem(`已选定底图: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  sourceImageName = file.name;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    sourceImageBytes = event.target.result;
    
    // Load image onto background canvas
    const img = new Image();
    img.onload = () => {
      setupCanvasEditor(img);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      logError('底图解析失败，无法渲染到画布上！');
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(new Blob([sourceImageBytes]));
  };
  reader.onerror = () => {
    logError('底图文件读取失败！');
  };
  reader.readAsArrayBuffer(file);
}

function setupCanvasEditor(img) {
  // Reveal workspace, hide dropzone
  elements.editDropzone.style.display = 'none';
  elements.canvasWorkspace.style.display = 'flex';
  
  // Match sizes
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  
  elements.bgCanvas.width = w;
  elements.bgCanvas.height = h;
  elements.paintCanvas.width = w;
  elements.paintCanvas.height = h;
  
  // Render background image
  const bgCtx = elements.bgCanvas.getContext('2d');
  bgCtx.drawImage(img, 0, 0);
  
  // Clear any old drawing
  clearMaskCanvas();
}

// ----------------------------------------------------
// GALLERY & LIGHTBOX
// ----------------------------------------------------
async function addImageToGallery(filePath, prompt, model, size) {
  logSystem(`正在加载生成的新图像：${filePath}...`);

  const res = await window.api.readImageBase64(filePath);
  if (!res.success) {
    logError(`画廊无法读取本地生成文件：${res.error}`);
    return;
  }

  const imageItem = {
    path: filePath,
    prompt: prompt,
    model: model,
    size: size,
    base64: res.base64
  };

  generatedImages.unshift(imageItem);

  // 限制画廊最大 50 张，防止内存无限增长
  if (generatedImages.length > 50) {
    generatedImages = generatedImages.slice(0, 50);
  }

  if (generatedImages.length === 1) {
    renderGallery();
  } else {
    const card = createGalleryCard(imageItem, 0);
    elements.galleryGrid.insertBefore(card, elements.galleryGrid.firstChild);

    const cards = elements.galleryGrid.querySelectorAll('.gallery-card');
    cards.forEach((c, idx) => {
      c.setAttribute('data-index', idx);
    });
    // 移除超出限制的 DOM 节点
    while (elements.galleryGrid.children.length > 50) {
      elements.galleryGrid.removeChild(elements.galleryGrid.lastChild);
    }
  }
}

function createGalleryCard(imgItem, index) {
  const card = document.createElement('div');
  card.className = 'gallery-card';
  card.setAttribute('data-index', index);
  
  const img = document.createElement('img');
  img.src = imgItem.base64;
  img.alt = 'Generated thumbnail';
  card.appendChild(img);
  
  // Add size badge
  const badge = document.createElement('span');
  badge.className = 'gallery-card-badge';
  badge.textContent = imgItem.size;
  card.appendChild(badge);
  
  card.addEventListener('click', () => {
    const idx = parseInt(card.getAttribute('data-index'));
    openLightbox(idx);
  });
  
  return card;
}

function renderGallery() {
  if (generatedImages.length === 0) {
    elements.galleryEmpty.style.display = 'flex';
    elements.galleryGrid.style.display = 'none';
    return;
  }
  
  elements.galleryEmpty.style.display = 'none';
  elements.galleryGrid.style.display = 'grid';
  elements.galleryGrid.innerHTML = '';
  
  generatedImages.forEach((imgItem, index) => {
    const card = createGalleryCard(imgItem, index);
    elements.galleryGrid.appendChild(card);
  });
}

// ----------------------------------------------------
// LIGHTBOX VIEW MODAL
// ----------------------------------------------------
let currentLightboxIndex = -1;

function initLightbox() {
  elements.btnLightboxClose.addEventListener('click', closeLightbox);
  
  // Add prev/next buttons
  elements.btnLightboxPrev = document.getElementById('btn-lightbox-prev');
  elements.btnLightboxNext = document.getElementById('btn-lightbox-next');
  
  if (elements.btnLightboxPrev) {
    elements.btnLightboxPrev.addEventListener('click', () => navigateLightbox(-1));
  }
  if (elements.btnLightboxNext) {
    elements.btnLightboxNext.addEventListener('click', () => navigateLightbox(1));
  }
  
  // Close on backdrop click
  elements.lightboxModal.addEventListener('click', (e) => {
    if (e.target === elements.lightboxModal) {
      closeLightbox();
    }
  });
  
  // Open image in default photo viewer
  elements.btnOpenImage.addEventListener('click', async () => {
    if (currentLightboxIndex >= 0) {
      const img = generatedImages[currentLightboxIndex];
      logSystem(`打开系统图片查看器: ${img.path}`);
      const res = await window.api.openPath(img.path);
      if (!res.success) {
        logError(`调用看图软件失败: ${res.error}`);
      }
    }
  });
  
  // Show image in windows file explorer
  elements.btnShowFolder.addEventListener('click', async () => {
    if (currentLightboxIndex >= 0) {
      const img = generatedImages[currentLightboxIndex];
      logSystem(`定位文件在文件夹中: ${img.path}`);
      const res = await window.api.showItemInFolder(img.path);
      if (!res.success) {
        logError(`无法在文件资源管理器中定位: ${res.error}`);
      }
    }
  });

  // Handle keyboard events (ESC, Left/Right arrows)
  document.addEventListener('keydown', (e) => {
    if (elements.lightboxModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        navigateLightbox(-1);
      } else if (e.key === 'ArrowRight') {
        navigateLightbox(1);
      }
    }
    
    const policyModal = document.getElementById('policy-modal');
    if (policyModal && policyModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        closePolicyModal();
      }
    }
  });
}

function openLightbox(index) {
  const imgItem = generatedImages[index];
  currentLightboxIndex = index;
  
  elements.lightboxImg.src = imgItem.base64;
  elements.infoPrompt.textContent = imgItem.prompt;
  elements.infoModel.textContent = imgItem.model || '-';
  elements.infoSize.textContent = imgItem.size || '-';
  elements.infoPath.textContent = imgItem.path;
  
  elements.lightboxModal.style.display = 'flex';
  
  // Hide or disable navigation buttons if there is only 1 image
  const prevBtn = document.getElementById('btn-lightbox-prev');
  const nextBtn = document.getElementById('btn-lightbox-next');
  if (prevBtn && nextBtn) {
    if (generatedImages.length <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    } else {
      prevBtn.style.display = 'flex';
      nextBtn.style.display = 'flex';
    }
  }
}

function closeLightbox() {
  elements.lightboxModal.style.display = 'none';
  currentLightboxIndex = -1;
}

function navigateLightbox(direction) {
  if (currentLightboxIndex < 0 || generatedImages.length <= 1) return;
  
  let newIndex = currentLightboxIndex + direction;
  // Circular wrap
  if (newIndex < 0) {
    newIndex = generatedImages.length - 1;
  } else if (newIndex >= generatedImages.length) {
    newIndex = 0;
  }
  
  openLightbox(newIndex);
}

// ----------------------------------------------------
// CONTENT POLICY MODAL
// ----------------------------------------------------
function initPolicyModal() {
  const btnClose = document.getElementById('btn-policy-close');
  const btnConfirm = document.getElementById('btn-policy-confirm');
  const btnHeader = document.getElementById('btn-header-policy');
  const modal = document.getElementById('policy-modal');

  if (btnClose) {
    btnClose.addEventListener('click', closePolicyModal);
  }
  if (btnConfirm) {
    btnConfirm.addEventListener('click', closePolicyModal);
  }
  if (btnHeader) {
    btnHeader.addEventListener('click', openPolicyModal);
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closePolicyModal();
      }
    });
  }
}

function openPolicyModal() {
  const modal = document.getElementById('policy-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closePolicyModal() {
  const modal = document.getElementById('policy-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}
