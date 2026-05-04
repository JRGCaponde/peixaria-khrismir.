const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
  })

  // Aponta para o arquivo gerado pelo seu build
  win.loadFile('dist/index.html')
}

app.whenReady().then(createWindow)
