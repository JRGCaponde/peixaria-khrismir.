/**
 * Script de empacotamento manual para Windows
 * Cria a pasta release/PeixariaKhrismir-win32-x64/ pronta a distribuir
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SRC_ELECTRON = path.join(__dirname, 'node_modules/electron/dist')
const OUT_DIR      = path.join(__dirname, 'release/PeixariaKhrismir-win32-x64')
const APP_DIR      = path.join(OUT_DIR, 'resources/app')

// ── Utilitários ────────────────────────────────────────────────
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

// ── Início ─────────────────────────────────────────────────────
console.log('\n🐟 Peixaria Khrismir — Construção do Executável\n')

// 1. Limpar e criar pasta de saída
if (fs.existsSync(OUT_DIR)) {
  console.log('🗑  Limpar pasta anterior...')
  fs.rmSync(OUT_DIR, { recursive: true })
}
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(APP_DIR, { recursive: true })

// 2. Copiar Electron (sem a pasta resources original, que vamos substituir)
console.log('📦 Copiar Electron...')
for (const entry of fs.readdirSync(SRC_ELECTRON, { withFileTypes: true })) {
  if (entry.name === 'resources') continue // substituímos a seguir
  const s = path.join(SRC_ELECTRON, entry.name)
  const d = path.join(OUT_DIR, entry.name)
  if (entry.isDirectory()) copyDir(s, d)
  else fs.copyFileSync(s, d)
}

// 3. Renomear electron.exe para o nome do produto
const exeSrc = path.join(OUT_DIR, 'electron.exe')
const exeDst = path.join(OUT_DIR, 'PeixariaKhrismir.exe')
fs.renameSync(exeSrc, exeDst)
console.log('✅ Executável: PeixariaKhrismir.exe')

// 4. Copiar ficheiros da app para resources/app/
console.log('📋 Copiar ficheiros da app...')

// package.json mínimo
fs.writeFileSync(path.join(APP_DIR, 'package.json'), JSON.stringify({
  name: 'peixaria-khrismir',
  version: '1.5.0',
  main: 'electron/main.cjs',
}, null, 2))

// Electron main process
const electronDir = path.join(APP_DIR, 'electron')
fs.mkdirSync(electronDir, { recursive: true })
fs.copyFileSync(
  path.join(__dirname, 'electron/main.cjs'),
  path.join(electronDir, 'main.cjs')
)

// dist (ficheiro único HTML com tudo incluído)
const distSrc = path.join(__dirname, 'dist')
if (!fs.existsSync(distSrc)) {
  console.error('❌ Pasta dist/ não encontrada. Execute primeiro: npm run build')
  process.exit(1)
}
const distDst = path.join(APP_DIR, 'dist')
copyDir(distSrc, distDst)
console.log('✅ App copiada para resources/app/')

// 5. Mostrar resultado
const exeSize = fs.statSync(exeDst).size
const htmlSize = fs.statSync(path.join(distDst, 'index.html')).size
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('✅ Pronto! Pasta criada:')
console.log(`   ${OUT_DIR}`)
console.log(`\n   PeixariaKhrismir.exe  ${mb(exeSize)}`)
console.log(`   index.html (app)       ${mb(htmlSize)}`)
console.log('\n📌 Para distribuir:')
console.log('   Compacte a pasta inteira em .zip e envie.')
console.log('   O utilizador extrai e abre PeixariaKhrismir.exe')
console.log('   Não precisa de instalar nada.')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
