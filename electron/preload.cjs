/**
 * preload.cjs — Ponte segura entre o renderer (React) e o processo principal (Node.js)
 * Expõe electronAPI com contextIsolation activo.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** Verdadeiro quando a app está dentro do Electron */
  isElectron: true,

  /**
   * Dispara npm run deploy:all no processo principal.
   * Retorna { ok: boolean, message: string }
   */
  deployAll: () => ipcRenderer.invoke('deploy:all'),

  /** Regista listener para logs de progresso do deploy */
  onDeployLog: (cb) => {
    const handler = (_event, msg) => cb(msg)
    ipcRenderer.on('deploy:log', handler)
    // devolve função para cancelar a subscrição
    return () => ipcRenderer.removeListener('deploy:log', handler)
  },

  /** Regista listener para conclusão do deploy (chamado uma vez) */
  onDeployDone: (cb) => {
    const handler = (_event, result) => cb(result)
    ipcRenderer.once('deploy:done', handler)
    return () => ipcRenderer.removeListener('deploy:done', handler)
  },

  /**
   * Fila de envio offline (SQLite, no processo principal) — permite a app
   * continuar a funcionar sem internet. Ver electron/db.cjs.
   */
  db: {
    upsertLocal: (table, rows) => ipcRenderer.invoke('db:upsertLocal', table, rows),
    deleteLocal: (table, id) => ipcRenderer.invoke('db:deleteLocal', table, id),
    getPendingOutbox: () => ipcRenderer.invoke('db:getPendingOutbox'),
    markSynced: (ids) => ipcRenderer.invoke('db:markSynced', ids),
  },
})
