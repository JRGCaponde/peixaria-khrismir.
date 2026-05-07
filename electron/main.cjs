const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron')
const path   = require('path')
const { spawn } = require('child_process')
const fs     = require('fs')

const isDev = process.env.NODE_ENV === 'development'

// Caminho base do projecto (onde está o package.json com npm run deploy:all)
// Em produção o executável está em resources/app/electron/main.cjs
// O projecto de desenvolvimento está 3 níveis acima
function getProjectRoot() {
  if (isDev) return path.join(__dirname, '..')
  // Tenta localizar a pasta raiz guardada ao lado do .exe
  const exeDir = path.dirname(process.execPath)
  const marker  = path.join(exeDir, '.khrismir-project-root')
  if (fs.existsSync(marker)) return fs.readFileSync(marker, 'utf8').trim()
  return null
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'Peixaria Khrismir',
    backgroundColor: '#f0f9ff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

function buildMenu() {
  const template = [
    {
      label: 'Ficheiro',
      submenu: [
        { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'reload',           label: 'Recarregar'      },
        { role: 'togglefullscreen', label: 'Ecrã Inteiro'    },
        { type: 'separator' },
        { role: 'zoomin',    label: 'Aumentar Zoom' },
        { role: 'zoomout',   label: 'Diminuir Zoom' },
        { role: 'resetzoom', label: 'Zoom Normal'   },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre Peixaria Khrismir',
          click: () => {
            const { dialog } = require('electron')
            dialog.showMessageBox({
              type: 'info',
              title: 'Peixaria Khrismir',
              message: 'Peixaria Khrismir',
              detail: 'Sistema de Gestão de Peixaria\nVersão 1.5\n\n© 2025 Khrismir',
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC: deploy:all ─────────────────────────────────────────────────────────
ipcMain.handle('deploy:all', async (event) => {
  const sender = event.sender

  const projectRoot = getProjectRoot()
  if (!projectRoot) {
    return {
      ok: false,
      message: 'Pasta do projecto não encontrada. Execute o deploy manualmente com "npm run deploy:all".',
    }
  }

  const log = (msg) => {
    console.log('[Deploy]', msg)
    if (!sender.isDestroyed()) sender.send('deploy:log', msg)
  }

  log('🚀 A iniciar deploy completo...')

  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const cmd   = isWin ? 'npm.cmd' : 'npm'

    // NODE_TLS_REJECT_UNAUTHORIZED=0 resolve problemas de SSL com o Vercel CLI
    const env = {
      ...process.env,
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    }

    const child = spawn(cmd, ['run', 'deploy:all'], {
      cwd:   projectRoot,
      env,
      shell: true,
    })

    child.stdout.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach(line => log(line))
    })
    child.stderr.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach(line => log('⚠ ' + line))
    })

    child.on('close', (code) => {
      const result = code === 0
        ? { ok: true,  message: '✅ Deploy completo! Browser e Electron actualizados.' }
        : { ok: false, message: `❌ Deploy falhou com código ${code}. Ver logs acima.` }
      log(result.message)
      if (!sender.isDestroyed()) sender.send('deploy:done', result)
      resolve(result)
    })

    child.on('error', (err) => {
      const result = { ok: false, message: `❌ Erro ao iniciar deploy: ${err.message}` }
      log(result.message)
      if (!sender.isDestroyed()) sender.send('deploy:done', result)
      resolve(result)
    })
  })
})

// ── Arranque ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
