const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let currentChild = null; // 当前运行的子进程引用，用于取消
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
const TASK_TIMEOUT_MS = 0; // 不设超时，仅手动取消
const POWERSHELL_PATH = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const STANDALONE_DEFAULT_CONFIG = {
  model: 'gpt-image-2',
  size: '1024x1024',
  quality: 'auto',
  background: 'auto',
  output_format: 'png'
};

function findImageGenPs1() {
  let currentDir = __dirname;
  while (true) {
    const candidate = path.join(currentDir, 'imagegen.ps1');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  return null;
}

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', payload);
  }
}

function setupAutoUpdate() {
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', info => {
    updateCheckInFlight = false;
    sendUpdateStatus({ state: 'available', version: info.version });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现更新',
      message: `发现新版本 ${info.version}`,
      detail: '将从我们的 GitHub Release 下载更新包。下载完成后会提示你重启安装。',
      buttons: ['立即下载', '稍后再说'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        downloadAppUpdate().catch(err => {
          sendUpdateStatus({ state: 'error', message: err.message });
        });
      }
    });
  });

  autoUpdater.on('update-not-available', info => {
    updateCheckInFlight = false;
    sendUpdateStatus({ state: 'current', version: info?.version || app.getVersion() });
  });

  autoUpdater.on('download-progress', progress => {
    sendUpdateStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', info => {
    updateDownloadInFlight = false;
    sendUpdateStatus({ state: 'downloaded', version: info.version });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下载',
      message: `新版本 ${info.version} 已下载完成`,
      detail: '点击重启后将自动安装更新。',
      buttons: ['立即重启', '稍后重启'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', err => {
    updateCheckInFlight = false;
    updateDownloadInFlight = false;
    sendUpdateStatus({ state: 'error', message: err.message });
  });
}

async function checkForAppUpdates(manual = false) {
  if (updateCheckInFlight) {
    return { success: false, error: '更新检查正在进行中' };
  }

  updateCheckInFlight = true;
  sendUpdateStatus({ state: 'checking' });

  try {
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version;
    const isUpdateAvailable = result?.isUpdateAvailable === true;

    if (isUpdateAvailable) {
      return { success: true, status: 'available', version };
    }

    if (manual) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '检查更新',
        message: '当前已经是最新版本',
        buttons: ['确定']
      });
    }

    return { success: true, status: 'current' };
  } catch (err) {
    if (manual) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: '检查更新失败',
        message: '无法检查更新',
        detail: err.message,
        buttons: ['确定']
      });
    }
    sendUpdateStatus({ state: 'error', message: err.message });
    return { success: false, error: err.message };
  } finally {
    updateCheckInFlight = false;
  }
}

async function downloadAppUpdate() {
  if (updateDownloadInFlight) {
    return { success: false, error: '更新下载正在进行中' };
  }

  updateDownloadInFlight = true;
  sendUpdateStatus({ state: 'downloading' });

  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    updateDownloadInFlight = false;
    throw err;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    title: "ImageGen Desktop Studio",
    backgroundColor: "#0d0e15",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  
  // Open DevTools if running in development mode (optional)
  // mainWindow.webContents.openDevTools();
}

function setCustomMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '刷新脚本默认配置',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-refresh-config');
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '强制刷新页面', role: 'forceReload' },
        { label: '切换开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', role: 'toggleFullScreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭窗口', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 ImageGen Studio',
          click: async () => {
            await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: `ImageGen Studio v${app.getVersion()}`,
              detail: '为 gpt-image-2 生图的桌面客户端 UI，由春哥 vibe coding。',
              buttons: ['确定']
            });
          }
        },
        {
          label: '检查更新',
          click: async () => {
            await checkForAppUpdates(true);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  setupAutoUpdate();
  createWindow();
  setCustomMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      setCustomMenu();
    }
  });
});

ipcMain.handle('check-for-updates', async () => {
  return checkForAppUpdates(true);
});

ipcMain.handle('download-app-update', async () => {
  return downloadAppUpdate();
});

ipcMain.handle('restart-to-update', async () => {
  autoUpdater.quitAndInstall();
  return { success: true };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler to load current imagegen configuration
ipcMain.handle('load-config', async () => {
  const psScript = findImageGenPs1();
  if (!psScript) {
    return {
      success: true,
      config: {
        ...STANDALONE_DEFAULT_CONFIG,
        base_url: process.env.OPENAI_BASE_URL || '',
        api_key_env: 'OPENAI_API_KEY'
      },
      raw: 'Running in standalone fallback mode (no imagegen.ps1 found)'
    };
  }
  return new Promise((resolve) => {
    const configEnv = { ...process.env };
    const embPyDir = path.join(__dirname, 'python-embed');
    if (fs.existsSync(path.join(embPyDir, 'python.exe'))) {
      configEnv['PATH'] = embPyDir + ';' + (configEnv['PATH'] || '');
    }

    const child = spawn(POWERSHELL_PATH, [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScript,
      '-ShowConfig'
    ], { env: configEnv });

    let output = '';
    let resolved = false;

    // 10-second timeout to prevent infinite hang
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { child.kill(); } catch (_) {}
        resolve({ success: false, error: 'load-config timed out after 10 seconds' });
      }
    }, 10000);

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      // Parse configuration from stdout
      // Format is e.g. "Model          : gpt-image-2"
      const config = {};
      const lines = output.split(/\r?\n/);
      
      lines.forEach(line => {
        const match = line.match(/^([A-Za-z0-9_\s]+)\s*:\s*(.+)$/);
        if (match) {
          const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
          const value = match[2].trim();
          config[key] = value;
        }
      });
      
      resolve({ success: true, config, raw: output });
    });
    
    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
});

// IPC Handler to show Native Save Dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || 'Save Image',
    defaultPath: options.defaultPath || 'output.png',
    filters: options.filters || [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ]
  });
  return result;
});

// IPC Handler to show Native Open Dialog (for files or directories)
ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Open File',
    properties: options.properties || ['openFile'],
    filters: options.filters || []
  });
  return result;
});

// IPC Handler to open paths or show in folder
ipcMain.handle('open-path', async (event, targetPath) => {
  const resolved = path.resolve(targetPath);
  if (fs.existsSync(resolved)) {
    const err = await shell.openPath(resolved);
    return { success: !err, error: err };
  }
  return { success: false, error: 'File does not exist: ' + resolved };
});

ipcMain.handle('show-item-in-folder', async (event, targetPath) => {
  const resolved = path.resolve(targetPath);
  if (fs.existsSync(resolved)) {
    shell.showItemInFolder(resolved);
    return { success: true };
  }
  return { success: false, error: 'File does not exist: ' + resolved };
});

const TASKKILL_PATH = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');

// 强制终止进程树（Windows 下 child.kill 不杀子进程）
function killProcessTree(child) {
  if (!child || child.killed) return;
  try {
    spawn(TASKKILL_PATH, ['/T', '/F', '/PID', child.pid.toString()], { stdio: 'ignore' });
  } catch (_) {
    child.kill('SIGKILL');
  }
}

// IPC Handler: 取消当前运行的任务
ipcMain.handle('cancel-imagegen', async () => {
  if (currentChild && !currentChild.killed) {
    killProcessTree(currentChild);
    mainWindow.webContents.send('log-data', { type: 'stderr', text: `[系统] 任务已被用户手动取消。\n` });
    return { cancelled: true };
  }
  return { cancelled: false };
});

// IPC Handler to run imagegen.ps1
ipcMain.handle('run-imagegen', async (event, args, envs) => {
  const psScript = findImageGenPs1();

  const processEnv = { ...process.env };
  if (envs) {
    Object.keys(envs).forEach(key => {
      if (envs[key]) {
        processEnv[key] = envs[key];
      }
    });
  }
  processEnv['PYTHONIOENCODING'] = 'utf-8';

  // 确保嵌入式 Python 在 PATH 中（供 imagegen.ps1 找到 python）
  const embeddedPythonDir = path.join(__dirname, 'python-embed');
  if (fs.existsSync(path.join(embeddedPythonDir, 'python.exe'))) {
    processEnv['PATH'] = embeddedPythonDir + ';' + (processEnv['PATH'] || '');
  }

  // 确定执行命令和参数
  let command, spawnArgs, cwd;

  // 打印传给子进程的环境变量（掩码），方便排查
  const debugKey = processEnv['OPENAI_API_KEY'] || '';
  const maskedKey = debugKey.length > 10 ? debugKey.slice(0, 6) + '...' + debugKey.slice(-4) : (debugKey ? '***' : '<未设置>');
  const debugBaseUrl = processEnv['OPENAI_BASE_URL'] || '<未设置>';
  mainWindow.webContents.send('log-data', { type: 'stdout', text: `[环境] API Key: ${maskedKey} | Base URL: ${debugBaseUrl}\n` });

  if (!psScript) {
    const pythonScript = path.resolve(__dirname, 'scripts', 'image_gen.py');
    if (!fs.existsSync(pythonScript)) {
      mainWindow.webContents.send('log-data', { type: 'error', text: `Error: Python script not found at ${pythonScript}\n` });
      return { code: -1, error: 'Python script not found' };
    }

    const embeddedPython = path.join(__dirname, 'python-embed', 'python.exe');
    if (fs.existsSync(embeddedPython)) {
      command = embeddedPython;
      mainWindow.webContents.send('log-data', { type: 'stdout', text: `[Standalone] 使用嵌入式 Python: ${command}\n` });
    } else {
      command = process.platform === 'win32' ? 'python.exe' : 'python';
      mainWindow.webContents.send('log-data', { type: 'stdout', text: `[Standalone] 使用系统 Python: ${command}\n` });
    }
    spawnArgs = [pythonScript, ...args];
    cwd = __dirname;
  } else {
    command = POWERSHELL_PATH;
    spawnArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, ...args];
    cwd = path.dirname(psScript);
  }

  return new Promise((resolve) => {
    let resolved = false;
    let timedOut = false;
    const outputPaths = []; // 收集 Python 输出的文件路径

    const child = spawn(command, spawnArgs, { env: processEnv, cwd });
    currentChild = child;

    child.stdout.on('data', (data) => {
      const text = data.toString();
      mainWindow.webContents.send('log-data', { type: 'stdout', text });
      // 解析输出路径: "Wrote /path/to/file.png" 或 "Wrote output\xxx.png"
      const match = text.match(/Wrote\s+(.+\.(?:png|jpg|jpeg|webp))/i);
      if (match) {
        let filePath = match[1].trim();
        if (!path.isAbsolute(filePath)) {
          filePath = path.resolve(cwd, filePath);
        }
        outputPaths.push(filePath);
      }
    });

    child.stderr.on('data', (data) => {
      mainWindow.webContents.send('log-data', { type: 'stderr', text: data.toString() });
    });

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      currentChild = null;
      resolve({ code, timedOut: false, outputPaths });
    });

    child.on('error', (err) => {
      if (resolved) return;
      // 如果是 standalone 模式且 python.exe 失败，尝试 py
      if (!psScript && command !== 'py') {
        mainWindow.webContents.send('log-data', { type: 'stdout', text: `'${command}' 启动失败，尝试 'py'...\n` });
        const fallback = spawn('py', spawnArgs, { env: processEnv, cwd });
        currentChild = fallback;

        fallback.stdout.on('data', (d) => {
          const text = d.toString();
          mainWindow.webContents.send('log-data', { type: 'stdout', text });
          const m = text.match(/Wrote\s+(.+\.(?:png|jpg|jpeg|webp))/i);
          if (m) {
            let fp = m[1].trim();
            if (!path.isAbsolute(fp)) fp = path.resolve(cwd, fp);
            outputPaths.push(fp);
          }
        });
        fallback.stderr.on('data', (d) => {
          mainWindow.webContents.send('log-data', { type: 'stderr', text: d.toString() });
        });
        fallback.on('close', (fallbackCode) => {
          if (resolved) return;
          resolved = true;
          currentChild = null;
          resolve({ code: fallbackCode, timedOut: false, outputPaths });
        });
        fallback.on('error', (fallbackErr) => {
          if (resolved) return;
          resolved = true;
          currentChild = null;
          mainWindow.webContents.send('log-data', { type: 'error', text: `Python 执行失败: ${fallbackErr.message}\n` });
          resolve({ code: -1, error: fallbackErr.message, outputPaths });
        });
      } else {
        resolved = true;
        currentChild = null;
        mainWindow.webContents.send('log-data', { type: 'error', text: `进程创建失败: ${err.message}\n` });
        resolve({ code: -1, error: err.message, outputPaths });
      }
    });
  });
});

function sanitizeTempFileName(fileName) {
  const fallbackName = `upload_${Date.now()}.bin`;
  const safeName = path.basename(String(fileName || fallbackName)).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  if (!safeName || safeName === '.' || safeName === '..') {
    return fallbackName;
  }
  return safeName;
}

// IPC Handler to save temp uploaded images or masks
ipcMain.handle('save-temp-file', async (event, fileName, arrayBuffer) => {
  try {
    const tempDir = path.join(__dirname, 'temp_uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const filePath = path.join(tempDir, sanitizeTempFileName(fileName));
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler: 清理临时文件
ipcMain.handle('cleanup-temp-files', async () => {
  try {
    const tempDir = path.join(__dirname, 'temp_uploads');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      let cleaned = 0;
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(tempDir, file));
          cleaned++;
        } catch (_) {}
      }
      return { success: true, cleaned };
    }
    return { success: true, cleaned: 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler to read a local image file as base64 (for the gallery or UI previews)
ipcMain.handle('read-image-base64', async (event, filePath) => {
  try {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) {
      const data = fs.readFileSync(resolved);
      const ext = path.extname(resolved).substring(1);
      return { success: true, base64: `data:image/${ext};base64,${data.toString('base64')}` };
    }
    return { success: false, error: 'File does not exist: ' + resolved };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
