/**
 * preload.cjs — Ponte segura entre o renderer (React) e o processo principal (Node.js)
 * Expõe electronAPI com contextIsolation activo.
 */
const { contextBridge, ipcRenderer } = require('electron')

// ── SQLite é a fonte de verdade ──────────────────────────────────────────────
// Corre ANTES de qualquer código da app (inclusive módulos que lêem o
// localStorage ao serem importados). Copia tudo do SQLite para o localStorage,
// que a app continua a usar como cache de trabalho. Chaves "sb-*" (sessão do
// Supabase) ficam de fora — a sessão nunca é restaurada de propósito.
const isMirrored = (k) => !k.startsWith('sb-')

function hydrateFromSqlite() {
  try {
    const rows = ipcRenderer.sendSync('kv:getAllSync')
    if (!Array.isArray(rows)) return // base de dados indisponível — não mexe em nada

    if (rows.length === 0) {
      // Primeira vez com o SQLite: importa o que a app já tinha em localStorage.
      const entries = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && isMirrored(k)) entries.push({ key: k, value: localStorage.getItem(k) })
      }
      if (entries.length) ipcRenderer.sendSync('kv:setManySync', entries)
      return
    }

    // Já há dados: o SQLite manda. O que estiver só no localStorage é resíduo.
    const inDb = new Set(rows.map(r => r.key))
    const stale = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && isMirrored(k) && !inDb.has(k)) stale.push(k)
    }
    stale.forEach(k => localStorage.removeItem(k))
    rows.forEach(r => localStorage.setItem(r.key, r.value))
  } catch (e) {
    console.error('[preload] erro ao carregar do SQLite:', e)
  }
}
hydrateFromSqlite()

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
    /** Grava chaves no armazém principal (value null apaga). Ver lib/sqliteMirror.ts */
    kvSetMany: (entries) => ipcRenderer.invoke('kv:setMany', entries),
    /** Versão síncrona — só para o fecho da janela, onde não dá para esperar. */
    kvSetManySync: (entries) => ipcRenderer.sendSync('kv:setManySync', entries),
  },
})
