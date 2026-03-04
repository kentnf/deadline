'use strict'

const { app, BrowserWindow, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const { spawn } = require('child_process')
const net = require('net')
const http = require('http')

// ── Configuration ────────────────────────────────────────────────────────────

const IS_DEV = !app.isPackaged
const DATA_DIR = app.getPath('userData')
const APP_VERSION = app.getVersion()

let backendProcess = null
let backendPort = null
let mainWindow = null
let splashWindow = null

// ── Port helpers ─────────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// ── Backend subprocess ───────────────────────────────────────────────────────

function getBackendBinary() {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(
    process.resourcesPath,
    'backend', 'server', `server${ext}`
  )
}

function startBackend(port, dataDir) {
  const binary = getBackendBinary()
  console.log(`[main] Starting backend: ${binary} --port ${port}`)

  backendProcess = spawn(binary, ['--port', String(port)], {
    env: { ...process.env, DATA_DIR: dataDir, APP_ENV: 'production' },
    // Create a new process group so we can kill all children
    detached: false,
  })

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProcess.on('exit', code => {
    console.log(`[main] Backend exited with code ${code}`)
  })
}

function waitForBackend(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    function poll() {
      http.get(`http://127.0.0.1:${port}/api/health`, res => {
        if (res.statusCode === 200) return resolve()
        retry()
      }).on('error', retry)
    }
    function retry() {
      if (Date.now() > deadline) return reject(new Error('Backend startup timed out'))
      setTimeout(poll, 500)
    }
    poll()
  })
}

function killBackend() {
  if (!backendProcess) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'])
    } else {
      process.kill(-backendProcess.pid, 'SIGTERM')
    }
  } catch (e) {
    try { backendProcess.kill() } catch (_) {}
  }
  backendProcess = null
}

// ── Windows ──────────────────────────────────────────────────────────────────

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 200,
    frame: false,
    resizable: false,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.on('closed', () => { splashWindow = null })
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: `Deadline v${APP_VERSION}`,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)
  mainWindow.once('ready-to-show', () => {
    if (splashWindow) splashWindow.close()
    mainWindow.show()
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Auto-update ──────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (IS_DEV) return

  autoUpdater.allowPrerelease = true

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '新版本已就绪',
      message: '新版本已下载完成，重启以完成更新。',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  try {
    autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.warn('[updater] Update check failed (network?):', e.message)
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.on('will-quit', () => {
  killBackend()
})

app.whenReady().then(async () => {
  if (IS_DEV) {
    // Dev mode: assume backend already running at 8000
    console.log('[main] Dev mode — skipping backend launch, loading localhost:8000')
    createMainWindow(8000)
    return
  }

  // Packaged mode
  createSplash()

  try {
    backendPort = await findFreePort()
    startBackend(backendPort, DATA_DIR)
    await waitForBackend(backendPort)
    createMainWindow(backendPort)
    setupAutoUpdater()
  } catch (err) {
    console.error('[main] Fatal:', err)
    if (splashWindow) {
      splashWindow.webContents.executeJavaScript(
        `document.getElementById('status').textContent = '启动失败：${err.message}\\n请重试或检查日志。'`
      )
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null && backendPort) createMainWindow(backendPort)
})
