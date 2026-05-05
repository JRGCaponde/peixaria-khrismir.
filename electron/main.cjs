const { app, BrowserWindow, shell, Menu } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

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
    },
    show: false, // mostra só depois de pronto
  })

  // Carrega a app
  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Mostra a janela quando estiver pronta (evita flash branco)
  win.once('ready-to-show', () => win.show())

  // Links externos abrem no browser do sistema
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
        { role: 'reload', label: 'Recarregar' },
        { role: 'togglefullscreen', label: 'Ecrã Inteiro' },
        { type: 'separator' },
        { role: 'zoomin',  label: 'Aumentar Zoom' },
        { role: 'zoomout', label: 'Diminuir Zoom' },
        { role: 'resetzoom', label: 'Zoom Normal' },
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
