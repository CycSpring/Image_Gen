# ImageGen Desktop Studio — Agent 开发指南

> **项目名称**: ImageGen Desktop Studio  
> **版本**: 1.0.0  
> **作者**: 春哥  
> **技术栈**: Electron 30 + Vanilla HTML/CSS/JS + Python 3.10 (嵌入式)  
> **平台**: Windows (win32 x64)

---

Using language：Chinese（中文）

## 常用命令

### 开发

| 命令 | 说明 |
|------|------|
| `npm start` | 以开发模式启动 Electron 应用（直接加载源码，支持热刷新页面） |
| `npm run package` | 使用 `electron-packager` 打包为绿色免安装目录 (`dist/ImageGenStudio-win32-x64/`) |
| `npm run dist` | 使用 `electron-builder` 构建发布版（生成便携单文件 `.exe` 和 NSIS 安装包） |

### 构建产物

| 产物 | 路径 | 说明 |
|------|------|------|
| 绿色目录版 | `dist/ImageGenStudio-win32-x64/` | `electron-packager` 输出，可直接运行 `ImageGenStudio.exe` |
| 便携单文件版 | `dist/ImageGenStudio 1.0.0.exe` | `electron-builder` 输出的 portable 版，双击即用 |
| NSIS 安装包 | `dist/ImageGenStudio Setup 1.0.0.exe` | `electron-builder` 输出的标准 Windows 安装程序 |
| 解压即用目录 | `dist/win-unpacked/` | `electron-builder` 输出的未打包目录 |

### 嵌入式 Python 环境

| 命令 | 说明 |
|------|------|
| `powershell -File setup-embed-python.ps1` | 下载 Python 3.10.11 嵌入包并安装 `openai`、`pillow`、`exceptiongroup` 到 `python-embed/` |
| `python-embed/python.exe scripts/image_gen.py generate --help` | 直接测试嵌入式 Python 脚本 |

### 测试与调试

本项目当前未配置自动化测试框架。手动验证方式如下：

| 操作 | 说明 |
|------|------|
| `npm start` | 启动应用后手动验证各 Tab 功能（文生图、图生图、批量任务） |
| 菜单栏 → 视图 → 切换开发者工具 | 打开 Chromium DevTools 进行前端调试 |
| 查看控制台日志面板 | 应用底部内置实时日志输出面板，显示 Python 脚本的 stdout/stderr |

### 代码检查

本项目当前未配置 ESLint 或 TypeScript。代码风格约定：
- JavaScript 使用 ES6+ 语法，不使用框架
- CSS 使用原生 CSS（无预处理器、无 Tailwind）
- Python 脚本遵循 PEP 8 风格

---

## 项目架构

```
imagegen-ui/
├── main.js                  # Electron 主进程（窗口管理、IPC、子进程调度）
├── preload.js               # IPC 安全桥接层（contextBridge API 暴露）
├── package.json             # 项目配置与构建脚本
├── .npmrc                   # npm 镜像配置（npmmirror 国内加速）
├── setup-embed-python.ps1   # 嵌入式 Python 环境一键搭建脚本
│
├── src/
│   ├── index.html           # 应用主界面 HTML 布局
│   ├── index.css            # 赛博朋克深空主题样式系统
│   └── index.js             # 前端交互逻辑控制器
│
├── scripts/
│   └── image_gen.py         # Python CLI 图像生成/编辑后端（独立运行模式）
│
├── python-embed/            # 内嵌 Python 3.10.11 运行时 + 依赖库
│   ├── python.exe
│   ├── python310._pth
│   └── Lib/site-packages/   # openai, pillow, exceptiongroup 等
│
├── dist/                    # 构建产物输出目录
├── output/                  # 默认图像生成输出目录
└── temp_uploads/            # 编辑模式临时文件（底图/蒙版）
```

---

## 进程架构与 IPC 通信

```
┌──────────────────────────┐     IPC (invoke/send)     ┌──────────────────────────┐
│     Main Process         │ ◄─────────────────────► │    Renderer Process      │
│     (main.js)            │     via preload.js        │    (src/index.js)        │
│                          │                           │                          │
│  • BrowserWindow 管理     │                           │  • UI 交互逻辑            │
│  • 原生菜单/对话框         │                           │  • Canvas 蒙版绘制        │
│  • 子进程 spawn 调度       │                           │  • 画廊/灯箱管理           │
│  • 文件系统读写            │                           │  • 实时日志渲染            │
└──────────┬───────────────┘                           └──────────────────────────┘
           │
           │ child_process.spawn
           ▼
┌──────────────────────────┐
│  Python / PowerShell     │
│                          │
│  模式 A: imagegen.ps1    │  ← 如果上级目录存在此脚本
│  模式 B: image_gen.py    │  ← 独立回退模式（嵌入式 Python）
└──────────────────────────┘
```

### IPC 通道清单

| 通道名 | 方向 | 说明 |
|--------|------|------|
| `load-config` | Renderer → Main | 读取 imagegen.ps1 的默认配置 |
| `run-imagegen` | Renderer → Main | 调用后端脚本执行生成/编辑/批量任务 |
| `show-save-dialog` | Renderer → Main | 弹出原生保存文件对话框 |
| `show-open-dialog` | Renderer → Main | 弹出原生打开文件/目录对话框 |
| `open-path` | Renderer → Main | 使用系统默认程序打开文件 |
| `show-item-in-folder` | Renderer → Main | 在文件资源管理器中定位文件 |
| `save-temp-file` | Renderer → Main | 保存临时上传文件（底图/蒙版） |
| `read-image-base64` | Renderer → Main | 读取本地图片并返回 Base64 数据 |
| `log-data` | Main → Renderer | 实时推送子进程 stdout/stderr 日志 |
| `menu-refresh-config` | Main → Renderer | 菜单栏触发配置刷新 |
| `menu-show-policy` | Main → Renderer | 菜单栏触发安全规范弹窗 |

---

## 执行模式

### 模式 A：PowerShell 脚本模式
当应用检测到上级目录中存在 `imagegen.ps1` 时，使用 PowerShell 调用该脚本。适用于开发者在本机有完整 Codex 环境的情况。

### 模式 B：独立回退模式 (Standalone Fallback)
当 `imagegen.ps1` 不存在时，直接使用嵌入式 `python-embed/python.exe` 执行 `scripts/image_gen.py`。适用于将应用分发给没有开发环境的普通用户。

查找优先级：嵌入式 Python (`python-embed/python.exe`) → 系统 `python.exe` → 系统 `py`

---

## 功能模块

### 文生图 (Generate)
- 输入提示词 → 调用 `image_gen.py generate --prompt ...`
- 支持参数：model、size、quality、background、format、n、augment hints
- 输出路径自动添加时间戳防覆盖

### 图生图 / 局部重绘 (Edit)
- 拖拽上传底图 → Canvas 画笔绘制蒙版区域
- 蒙版编译：`destination-out` 合成 → 透明区域 = 需重绘区域
- 调用 `image_gen.py edit --image ... --mask ...`

### 批量任务 (Batch)
- 支持 JSONL 文本直接输入或本地文件读取
- 异步并发执行，可配置并发数和重试次数
- 调用 `image_gen.py generate-batch --input ... --out-dir ...`

### 内容安全规范弹窗
- 界面标题栏"💡 提示词规范"按钮触发
- 展示 DALL-E 3 安全审核系统禁止的六大内容类别
- 提供绕过敏感词的实用提示

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | 从 `~/.codex/auth.json` 读取或界面手动输入 |
| `OPENAI_BASE_URL` | API 代理地址 | 系统配置值或界面手动输入 |
| `PYTHONIOENCODING` | Python 输出编码 | 自动设为 `utf-8`（由 main.js 注入） |

---

## 构建与分发注意事项

1. **asar 已禁用** (`"asar": false`)：因为需要运行嵌入式 Python 和外部脚本，无法使用 asar 归档。
2. **镜像加速**：`.npmrc` 配置了 npmmirror 国内镜像，加速 Electron 二进制文件下载。
3. **打包前清理**：打包前务必确认没有残留的 `ImageGenStudio.exe` 进程锁定 dist 目录文件。执行 `taskkill /F /IM ImageGenStudio.exe` 再打包。
4. **嵌入式 Python 依赖**：使用 `--python-version 3.10 --platform win_amd64 --implementation cp --only-binary=:all:` 确保安装 cp310 wheels。
5. **python310._pth 配置**：必须以无 BOM 的 UTF-8 编码写入，否则 Python 启动时会报 `ModuleNotFoundError: No module named 'encodings'`。

---

## 关键设计决策

| 决策 | 原因 |
|------|------|
| 不使用框架 (React/Vue) | 项目为桌面工具型应用，原生 HTML/CSS/JS 足够且启动更快 |
| 双画布蒙版系统 | `bg-canvas` 显示底图 + `paint-canvas` 绘制蒙版，分层互不干扰 |
| contextIsolation + preload | Electron 安全最佳实践，禁用 nodeIntegration |
| 子进程 spawn 替代 exec | 支持实时日志流式推送，避免输出缓冲区溢出 |
| 时间戳输出路径 | 防止连续生成覆盖历史文件 |
| 300 秒 API 超时 | 2K 大图生成 + 中转代理下载可能需要较长时间 |
| 10 秒配置读取超时 | 防止 PowerShell 挂起导致界面无限等待 |

---

## 文件职责速查

| 文件 | 职责 |
|------|------|
| `main.js` | Electron 主进程：窗口创建、原生菜单、IPC 处理、子进程管理 |
| `preload.js` | IPC 桥接层：安全暴露 `window.api` 给渲染进程 |
| `src/index.html` | 界面结构：三个功能 Tab、侧边栏参数、控制台、画廊、灯箱、弹窗 |
| `src/index.css` | 视觉主题：深空赛博朋克风格、玻璃态卡片、渐变动画、自定义滚动条 |
| `src/index.js` | 前端逻辑：Tab 切换、参数编译、Canvas 绘制、画廊管理、API 调用 |
| `scripts/image_gen.py` | Python 后端 CLI：图像生成/编辑/批量处理、提示词增强、Base64 解码写盘 |
| `setup-embed-python.ps1` | 环境搭建：下载嵌入式 Python + 安装依赖到 `python-embed/` |
| `package.json` | 项目元数据、npm scripts、electron-builder 配置 |
