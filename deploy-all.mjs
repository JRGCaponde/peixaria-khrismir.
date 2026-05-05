/**
 * deploy-all.mjs
 * Actualiza o sistema completo: Browser (Vercel) + Electron (.exe)
 * Uso: npm run deploy:all
 */

import { execSync } from 'child_process'

const run = (cmd, label) => {
  console.log(`\n${'━'.repeat(50)}`)
  console.log(`▶  ${label}`)
  console.log(`${'━'.repeat(50)}`)
  execSync(cmd, { stdio: 'inherit' })
}

console.log('\n🐟 Peixaria Khrismir — Deploy Completo')
console.log('Browser (Vercel) + Electron (.exe)\n')

// 1. Build web (para Vercel)
run('npm run build:web', '1/4 — Build Web (Vercel)')

// 2. Build Electron (vite build inline + empacotar)
run('npm run build', '2/4 — Build Electron (single-file)')
run('node build-app.mjs', '3/4 — Empacotar PeixariaKhrismir.exe')

// 3. Deploy Vercel
run('npx vercel deploy --prod --yes', '4/4 — Deploy Vercel (browser)')

console.log('\n' + '━'.repeat(50))
console.log('✅ SISTEMA COMPLETO ACTUALIZADO!')
console.log('')
console.log('   🌐 Browser: https://peixaria-khrismir.vercel.app')
console.log('   🖥️  Electron: release/PeixariaKhrismir-win32-x64/PeixariaKhrismir.exe')
console.log('━'.repeat(50) + '\n')
