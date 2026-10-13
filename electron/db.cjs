/**
 * db.cjs — Fila de envio durável (SQLite), processo principal.
 *
 * Usa o módulo nativo `node:sqlite` do Node embutido no Electron — sem
 * dependências a instalar, sem compilação nativa, sem alterações ao
 * empacotamento (build-app.mjs não precisa de copiar node_modules).
 *
 * A app continua a ler/escrever localStorage como sempre — isto é só uma
 * fila (sync_outbox) que fica na mesma linha de registo a aguardar envio ao
 * Supabase, mesmo que a app feche ou fique sem internet a meio. Substitui o
 * "faz-e-esquece": uma escrita directa ao Supabase que falha silenciosamente
 * offline, sem nada a retomar depois — foi exactamente isso que causou
 * perda de dados nesta app (ex: movimentos de caixa apagados que voltavam).
 */
const { DatabaseSync } = require('node:sqlite')
const path = require('path')
const { app } = require('electron')

let db = null

function getDb() {
  if (db) return db
  const dbPath = path.join(app.getPath('userData'), 'khrismir.db')
  db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      op TEXT NOT NULL CHECK(op IN ('upsert','delete')),
      payload TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `)
  // Cada entrada da fila pertence a UMA loja — sem isto, o trabalho de uma loja
  // era mostrado/enviado na loja que estivesse aberta a seguir.
  try { db.exec('ALTER TABLE sync_outbox ADD COLUMN store_id TEXT') } catch { /* já existe */ }
  // Entradas antigas: a loja vem do próprio registo, quando o tem.
  db.exec(`
    UPDATE sync_outbox SET store_id = json_extract(payload, '$.store_id')
    WHERE store_id IS NULL AND payload IS NOT NULL AND json_extract(payload, '$.store_id') IS NOT NULL
  `)
  // Armazém principal dos dados da app: uma linha por chave (ex: khrismir_products,
  // cf_movements) com o JSON completo. O SQLite é a fonte de verdade — no arranque
  // o preload copia daqui para o localStorage (cache de trabalho da app).
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  return db
}

function kvGetAll() {
  return getDb().prepare('SELECT key, value FROM kv').all().map(r => ({ key: r.key, value: r.value }))
}

/** entries: [{ key, value }] — value null apaga a chave. Tudo numa transacção. */
function kvSetMany(entries) {
  const d = getDb()
  const now = new Date().toISOString()
  const set = d.prepare(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
  const del = d.prepare('DELETE FROM kv WHERE key = ?')
  d.exec('BEGIN')
  try {
    for (const { key, value } of entries) {
      if (value === null) del.run(key)
      else set.run(key, value, now)
    }
    d.exec('COMMIT')
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

// Uma linha pendente ocupa uma só entrada: a mais recente. Só o último pedido
// por linha conta (gravar/apagar), e sem isto cada gravação de produtos
// re-enfileirava o catálogo inteiro e a fila crescia sem parar.
function supersede(d, table, rowId, storeId) {
  d.prepare(
    `DELETE FROM sync_outbox WHERE synced_at IS NULL AND table_name = ? AND row_id = ? AND store_id IS ?`
  ).run(table, rowId, storeId ?? null)
}

function upsertLocal(table, rows, storeId) {
  const d = getDb()
  const now = new Date().toISOString()
  const stmt = d.prepare(
    `INSERT INTO sync_outbox (table_name, row_id, op, payload, created_at, store_id) VALUES (?, ?, 'upsert', ?, ?, ?)`
  )
  d.exec('BEGIN')
  try {
    for (const row of rows) {
      supersede(d, table, String(row.id), storeId)
      stmt.run(table, String(row.id), JSON.stringify(row), now, storeId ?? null)
    }
    d.exec('COMMIT')
  } catch (e) { d.exec('ROLLBACK'); throw e }
}

function deleteLocal(table, id, storeId) {
  const d = getDb()
  const now = new Date().toISOString()
  supersede(d, table, String(id), storeId)
  d.prepare(
    `INSERT INTO sync_outbox (table_name, row_id, op, payload, created_at, store_id) VALUES (?, ?, 'delete', NULL, ?, ?)`
  ).run(table, String(id), now, storeId ?? null)
}

/** Limpeza única das entradas antigas repetidas: fica só a mais recente de cada linha. */
function compactPending() {
  return getDb().prepare(`
    DELETE FROM sync_outbox WHERE synced_at IS NULL AND id NOT IN (
      SELECT MAX(id) FROM sync_outbox WHERE synced_at IS NULL GROUP BY table_name, row_id, store_id
    )
  `).run().changes
}

/** Migração: entradas antigas sem loja passam para a loja indicada (a que está aberta). */
function adoptOrphans(storeId) {
  if (!storeId) return 0
  const n = getDb().prepare('UPDATE sync_outbox SET store_id = ? WHERE store_id IS NULL AND synced_at IS NULL').run(storeId).changes
  if (n) compactPending() // entradas antigas repetidas: fica só a mais recente
  return n
}

function getPendingOutbox() {
  const d = getDb()
  return d.prepare(`SELECT * FROM sync_outbox WHERE synced_at IS NULL ORDER BY id`).all()
    .map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }))
}

function markSynced(ids) {
  if (!ids.length) return
  const d = getDb()
  const now = new Date().toISOString()
  const stmt = d.prepare(`UPDATE sync_outbox SET synced_at = ? WHERE id = ?`)
  for (const id of ids) stmt.run(now, id)
}

module.exports = { upsertLocal, deleteLocal, adoptOrphans, getPendingOutbox, markSynced, kvGetAll, kvSetMany }
