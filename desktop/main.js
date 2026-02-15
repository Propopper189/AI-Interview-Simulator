const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const isDev = !app.isPackaged;
let backendProcess;

function resolveAppIcon() {
  if (app.isPackaged) {
    const packagedIcon = path.join(process.resourcesPath, 'frontend', 'icon.png');
    if (fs.existsSync(packagedIcon)) return packagedIcon;
  }

  const devIcon = path.resolve(__dirname, '..', 'frontend', 'public', 'icon.png');
  return fs.existsSync(devIcon) ? devIcon : undefined;
}


function resolvePythonCommand() {
  if (process.platform === 'win32') return 'python';
  return 'python3';
}

function getBackendCommand() {
  if (app.isPackaged) {
    return {
      command: path.join(process.resourcesPath, 'AIInterviewBackend.exe'),
      args: [],
      cwd: process.resourcesPath,
    };
  }

  return {
    command: resolvePythonCommand(),
    args: ['backend/backend.py'],
    cwd: path.resolve(__dirname, '..'),
  };
}

function startBackend() {
  const backend = getBackendCommand();

  backendProcess = spawn(backend.command, backend.args, {
    cwd: backend.cwd,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  backendProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[backend] ${chunk}`);
  });

  backendProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[backend-error] ${chunk}`);
  });

  backendProcess.on('error', (error) => {
    dialog.showErrorBox('Backend Launch Failed', `Could not start backend process: ${error.message}`);
  });
}

function waitForBackend(timeoutMs = 15000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get('http://127.0.0.1:5000/settings/api-key', (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error('Backend did not become ready in time.'));
          return;
        }
        setTimeout(probe, 500);
      });

      req.setTimeout(2500, () => {
        req.destroy();
      });
    };

    probe();
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: resolveAppIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await win.loadURL('http://localhost:4173');
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const indexPath = path.join(process.resourcesPath, 'frontend', 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Frontend build not found at ${indexPath}.`);
  }
  await win.loadFile(indexPath);
}

app.whenReady().then(async () => {
  try {
    startBackend();
    await waitForBackend();
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('Application Startup Failed', error.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
