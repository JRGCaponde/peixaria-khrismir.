/**
 * build-app.mjs — Empacotamento do Electron para Windows
 *
 * Estratégia em dois modos:
 *  - FRESH: pasta release não existe → copia Electron completo + app
 *  - UPDATE: pasta existe mas exe está bloqueado → actualiza só o código da app
 *            (útil quando o utilizador está a usar o .exe enquanto fazemos deploy)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SRC_ELECTRON = path.join(__dirname, 'node_modules/electron/dist')
const OUT_DIR      = path.join(__dirname, 'release/PeixariaKhrismir-win32-x64')
const APP_DIR      = path.join(OUT_DIR, 'resources/app')

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB' }

function tryRmDir(dir) {
  try { fs.rmSync(dir, { recursive: true }); return true }
  catch { return false }
}

console.log('\n🐟 Peixaria Khrismir — Construção do Executável\n')

const exeDst = path.join(OUT_DIR, 'PeixariaKhrismir.exe')
const alreadyExists = fs.existsSync(exeDst)

// ── MODO FRESH (primeira vez ou pasta limpa) ────────────────────
if (!alreadyExists) {
  console.log('📦 Instalação completa (cópia do Electron)...')

  if (fs.existsSync(OUT_DIR)) tryRmDir(OUT_DIR)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(APP_DIR, { recursive: true })

  // Copiar Electron (sem pasta resources — substituímos)
  for (const entry of fs.readdirSync(SRC_ELECTRON, { withFileTypes: true })) {
    if (entry.name === 'resources') continue
    const s = path.join(SRC_ELECTRON, entry.name)
    const d = path.join(OUT_DIR, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }

  // Renomear electron.exe → PeixariaKhrismir.exe
  const exeSrc = path.join(OUT_DIR, 'electron.exe')
  fs.renameSync(exeSrc, exeDst)
  console.log('✅ Executável: PeixariaKhrismir.exe')

} else {
  // ── MODO UPDATE (exe existe — só actualiza o código da app) ───
  console.log('🔄 Modo actualização — só o código da app será substituído')
  console.log('   (O PeixariaKhrismir.exe pode estar aberto — sem problema)')

  // Apagar só a pasta app (não o exe nem as DLLs)
  if (fs.existsSync(APP_DIR)) {
    const removed = tryRmDir(APP_DIR)
    if (!removed) {
      console.warn('⚠  Não foi possível limpar resources/app — continuando na mesma...')
    }
  }
  fs.mkdirSync(APP_DIR, { recursive: true })
}

// ── Copiar código da app (igual em ambos os modos) ─────────────
console.log('📋 Copiar código da app...')

fs.writeFileSync(path.join(APP_DIR, 'package.json'), JSON.stringify({
  name: 'peixaria-khrismir',
  version: '1.5.0',
  main: 'electron/main.cjs',
}, null, 2))

const electronDir = path.join(APP_DIR, 'electron')
fs.mkdirSync(electronDir, { recursive: true })
fs.copyFileSync(path.join(__dirname, 'electron/main.cjs'),    path.join(electronDir, 'main.cjs'))
fs.copyFileSync(path.join(__dirname, 'electron/preload.cjs'), path.join(electronDir, 'preload.cjs'))

// Marcador com o caminho do projecto (para o botão de deploy nativo)
fs.writeFileSync(path.join(OUT_DIR, '.khrismir-project-root'), __dirname)

const distSrc = path.join(__dirname, 'dist')
if (!fs.existsSync(distSrc)) {
  console.error('❌ Pasta dist/ não encontrada. Execute primeiro: npm run build')
  process.exit(1)
}
copyDir(distSrc, path.join(APP_DIR, 'dist'))
console.log('✅ App copiada para resources/app/')

// ── Resultado ──────────────────────────────────────────────────
const exeSize  = fs.statSync(exeDst).size
const htmlSize = fs.statSync(path.join(APP_DIR, 'dist', 'index.html')).size
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(alreadyExists ? '🔄 App actualizada (reinicie o PeixariaKhrismir.exe)' : '✅ Instalação completa!')
console.log(`   ${OUT_DIR}`)
console.log(`\n   PeixariaKhrismir.exe  ${mb(exeSize)}`)
console.log(`   index.html (app)       ${mb(htmlSize)}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
