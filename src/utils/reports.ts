/**
 * reports.ts — Relatórios PDF da Peixaria Khrismir
 * Abre nova janela HTML e aciona window.print() (→ "Guardar como PDF")
 */

import type { Order, Purchase, CashFlow } from '../types/database'
import type { StoreSettings } from '../lib/settings'

// ── Utilitários ────────────────────────────────────────────────────────────────
const f = (n: number) =>
  n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const pct = (part: number, total: number) =>
  total > 0 ? ((part / total) * 100).toFixed(1) + '%' : '0%'

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function openPDF(html: string, title: string) {
  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 600)
}

function baseCSS() {
  return `
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px 28px;max-width:1050px;margin:0 auto}
      h1{font-size:20px;font-weight:900;color:#0f172a}
      h2{font-size:13px;font-weight:700;color:#334155;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0891b2;padding-bottom:14px;margin-bottom:18px}
      .company{font-size:18px;font-weight:900;color:#0891b2}
      .company small{display:block;font-size:9px;font-weight:normal;color:#64748b;margin-top:2px}
      .doc-title{text-align:right}
      .doc-title h1{font-size:17px;color:#1e293b}
      .doc-title p{font-size:10px;color:#64748b;margin-top:2px}
      .kpi-grid{display:grid;gap:10px;margin-bottom:18px}
      .kpi-grid-4{grid-template-columns:repeat(4,1fr)}
      .kpi-grid-3{grid-template-columns:repeat(3,1fr)}
      .kpi-grid-2{grid-template-columns:repeat(2,1fr)}
      .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px}
      .kpi label{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:3px}
      .kpi .val{font-size:15px;font-weight:900;color:#0f172a}
      .kpi .sub{font-size:9px;color:#64748b;margin-top:2px}
      .kpi.green{border-color:#bbf7d0;background:#f0fdf4}.kpi.green .val{color:#15803d}
      .kpi.red{border-color:#fecaca;background:#fff1f2}.kpi.red .val{color:#b91c1c}
      .kpi.blue{border-color:#bfdbfe;background:#eff6ff}.kpi.blue .val{color:#1d4ed8}
      .kpi.amber{border-color:#fde68a;background:#fffbeb}.kpi.amber .val{color:#b45309}
      table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px}
      thead th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
      tbody tr:nth-child(even){background:#f8fafc}
      tbody tr:hover{background:#f1f5f9}
      td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
      .tr{text-align:right}
      .tc{text-align:center}
      .bold{font-weight:700}
      .green-t{color:#15803d;font-weight:700}
      .red-t{color:#b91c1c;font-weight:700}
      .total-row td{background:#0891b2;color:#fff;font-weight:900;font-size:12px;padding:7px 8px;border:none}
      .badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:9px;font-weight:700}
      .badge-green{background:#dcfce7;color:#166534}
      .badge-red{background:#fee2e2;color:#991b1b}
      .badge-gray{background:#f1f5f9;color:#475569}
      .badge-blue{background:#dbeafe;color:#1e40af}
      .badge-amber{background:#fef3c7;color:#92400e}
      .sep{border:none;border-top:1px dashed #cbd5e1;margin:12px 0}
      .footer{margin-top:20px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between}
      @media print{body{padding:10px}@page{margin:8mm;size:A4}}
    </style>`
}

function reportHeader(settings: StoreSettings, title: string, subtitle: string) {
  return `
  <div class="hdr">
    <div>
      <div class="company">${settings.name}<small>${settings.address} &nbsp;•&nbsp; NIF: ${settings.nif}</small></div>
      <div style="font-size:9px;color:#64748b;margin-top:3px">Tel: ${settings.phone} &nbsp;|&nbsp; ${settings.email}</div>
    </div>
    <div class="doc-title">
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <p>Gerado em: ${new Date().toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}</p>
    </div>
  </div>`
}

function reportFooter(settings: StoreSettings) {
  return `
  <div class="footer">
    <span>${settings.name} &nbsp;•&nbsp; NIF: ${settings.nif} &nbsp;•&nbsp; Peixaria Khrismir v1.5</span>
    <span>Documento gerado em ${new Date().toLocaleString('pt-AO')} &nbsp;•&nbsp; Pág. 1</span>
  </div>`
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. RELATÓRIO DE VENDAS DIÁRIO
// ══════════════════════════════════════════════════════════════════════════════
export function printDailySalesReport(orders: Order[], settings: StoreSettings, date: string) {
  const ivaRate = settings.iva_rate / 100
  const dayOrders = orders.filter(o => o.created_at.slice(0, 10) === date)
  const valid     = dayOrders.filter(o => o.status !== 'cancelado')
  const cancelled = dayOrders.filter(o => o.status === 'cancelado')

  const total    = valid.reduce((s, o) => s + o.total, 0)
  const baseTrib = total / (1 + ivaRate)
  const ivaVal   = total - baseTrib

  const byPayment: Record<string, number> = {}
  valid.forEach(o => { byPayment[o.payment_type] = (byPayment[o.payment_type] ?? 0) + o.total })

  const payLabel: Record<string, string> = { dinheiro: 'Dinheiro', multicaixa: 'Multicaixa', express: 'Express' }
  const statusLabel: Record<string, string> = {
    pendente: 'Pendente', confirmado: 'Confirmado', preparando: 'Preparando',
    pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado',
  }
  const statusBadge: Record<string, string> = {
    pendente: 'badge-amber', confirmado: 'badge-blue', preparando: 'badge-blue',
    pronto: 'badge-green', entregue: 'badge-green', cancelado: 'badge-red',
  }

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('pt-AO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  const rows = dayOrders.map(o => {
    const hora = new Date(o.created_at).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })
    const oIva = o.total - o.total / (1 + ivaRate)
    const isCancelled = o.status === 'cancelado'
    return `
    <tr style="${isCancelled ? 'opacity:.5;text-decoration:line-through' : ''}">
      <td class="bold">${o.order_number}</td>
      <td>${hora}</td>
      <td>${o.customer_name || 'Consumidor Final'}</td>
      <td>${o.customer_nif || '—'}</td>
      <td class="tc">${o.items.length}</td>
      <td class="tc"><span class="badge badge-gray">${payLabel[o.payment_type] ?? o.payment_type}</span></td>
      <td class="tc">${o.delivery_type === 'delivery' ? '🚚' : '🏪'}</td>
      <td class="tr">${f(oIva)}</td>
      <td class="tr bold ${isCancelled ? '' : 'green-t'}">${f(o.total)}</td>
      <td class="tc"><span class="badge ${statusBadge[o.status] ?? 'badge-gray'}">${statusLabel[o.status] ?? o.status}</span></td>
    </tr>`
  }).join('')

  const paymentRows = Object.entries(byPayment).map(([k, v]) => `
    <tr>
      <td>${payLabel[k] ?? k}</td>
      <td class="tr">${valid.filter(o => o.payment_type === k).length} vendas</td>
      <td class="tr bold">${f(v)} AKZ</td>
      <td class="tr">${pct(v, total)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>Relatório Vendas ${date}</title>${baseCSS()}</head><body>
  ${reportHeader(settings, 'RELATÓRIO DE VENDAS DIÁRIO', dateLabel)}

  <div class="kpi-grid kpi-grid-4">
    <div class="kpi green"><label>Total Faturado</label><div class="val">${f(total)} AKZ</div><div class="sub">${valid.length} venda(s) válida(s)</div></div>
    <div class="kpi blue"><label>Base Tributável</label><div class="val">${f(baseTrib)} AKZ</div><div class="sub">Sem IVA</div></div>
    <div class="kpi amber"><label>IVA (${settings.iva_rate}%)</label><div class="val">${f(ivaVal)} AKZ</div><div class="sub">A entregar à AGT</div></div>
    <div class="kpi ${cancelled.length > 0 ? 'red' : ''}"><label>Canceladas</label><div class="val">${cancelled.length}</div><div class="sub">De ${dayOrders.length} total</div></div>
  </div>

  <h2>Por Método de Pagamento</h2>
  <table>
    <thead><tr><th>Método</th><th class="tr">Nº Vendas</th><th class="tr">Valor</th><th class="tr">%</th></tr></thead>
    <tbody>
      ${paymentRows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem vendas neste dia</td></tr>'}
    </tbody>
    <tr class="total-row"><td>TOTAL</td><td class="tr">${valid.length}</td><td class="tr">${f(total)} AKZ</td><td class="tr">100%</td></tr>
  </table>

  <h2>Detalhe das Vendas</h2>
  <table>
    <thead>
      <tr>
        <th>Nº Venda</th><th>Hora</th><th>Cliente</th><th>NIF</th>
        <th class="tc">Itens</th><th class="tc">Pagamento</th><th class="tc">Tipo</th>
        <th class="tr">IVA (AKZ)</th><th class="tr">Total (AKZ)</th><th class="tc">Estado</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8">Sem vendas registadas neste dia</td></tr>'}
    </tbody>
    <tr class="total-row">
      <td colspan="7">TOTAIS DO DIA</td>
      <td class="tr">${f(ivaVal)} AKZ</td>
      <td class="tr">${f(total)} AKZ</td>
      <td></td>
    </tr>
  </table>

  ${reportFooter(settings)}
</body></html>`

  openPDF(html, `Vendas ${date}`)
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. RELATÓRIO DE VENDAS MENSAL
// ══════════════════════════════════════════════════════════════════════════════
export function printMonthlySalesReport(orders: Order[], settings: StoreSettings, year: number, month: number) {
  const ivaRate = settings.iva_rate / 100
  const monthOrders = orders.filter(o => {
    const d = new Date(o.created_at)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })
  const valid     = monthOrders.filter(o => o.status !== 'cancelado')
  const cancelled = monthOrders.filter(o => o.status === 'cancelado')
  const total     = valid.reduce((s, o) => s + o.total, 0)
  const baseTrib  = total / (1 + ivaRate)
  const ivaVal    = total - baseTrib

  // Vendas por dia
  const byDay: Record<string, { count: number; total: number }> = {}
  valid.forEach(o => {
    const d = o.created_at.slice(0, 10)
    if (!byDay[d]) byDay[d] = { count: 0, total: 0 }
    byDay[d].count++
    byDay[d].total += o.total
  })

  const byPayment: Record<string, number> = {}
  valid.forEach(o => { byPayment[o.payment_type] = (byPayment[o.payment_type] ?? 0) + o.total })
  const payLabel: Record<string, string> = { dinheiro: 'Dinheiro', multicaixa: 'Multicaixa', express: 'Express' }

  const daysRows = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => `
    <tr>
      <td>${new Date(d + 'T12:00').toLocaleDateString('pt-AO', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
      <td class="tc">${v.count}</td>
      <td class="tr bold">${f(v.total)} AKZ</td>
      <td class="tr">${f(v.total / (1 + ivaRate))} AKZ</td>
      <td class="tr">${f(v.total - v.total / (1 + ivaRate))} AKZ</td>
    </tr>`).join('')

  const payRows = Object.entries(byPayment).map(([k, v]) => `
    <tr>
      <td>${payLabel[k] ?? k}</td>
      <td class="tr">${valid.filter(o => o.payment_type === k).length}</td>
      <td class="tr bold">${f(v)} AKZ</td>
      <td class="tr">${pct(v, total)}</td>
    </tr>`).join('')

  const allRows = monthOrders.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(o => `
    <tr style="${o.status === 'cancelado' ? 'opacity:.5' : ''}">
      <td class="bold">${o.order_number}</td>
      <td>${new Date(o.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${o.customer_name || 'Consumidor Final'}</td>
      <td>${o.customer_nif || '—'}</td>
      <td class="tc">${payLabel[o.payment_type] ?? o.payment_type}</td>
      <td class="tr">${f(o.total - o.total / (1 + ivaRate))} AKZ</td>
      <td class="tr bold ${o.status === 'cancelado' ? 'red-t' : 'green-t'}">${f(o.total)} AKZ</td>
      <td class="tc">${o.status === 'cancelado' ? '<span class="badge badge-red">Cancelado</span>' : '<span class="badge badge-green">Válido</span>'}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>Vendas ${MONTHS_PT[month-1]} ${year}</title>${baseCSS()}</head><body>
  ${reportHeader(settings, 'RELATÓRIO DE VENDAS MENSAL', `${MONTHS_PT[month - 1]} de ${year}`)}

  <div class="kpi-grid kpi-grid-4">
    <div class="kpi green"><label>Total Faturado</label><div class="val">${f(total)} AKZ</div><div class="sub">${valid.length} vendas válidas</div></div>
    <div class="kpi blue"><label>Base Tributável</label><div class="val">${f(baseTrib)} AKZ</div></div>
    <div class="kpi amber"><label>IVA (${settings.iva_rate}%)</label><div class="val">${f(ivaVal)} AKZ</div></div>
    <div class="kpi ${cancelled.length > 0 ? 'red' : ''}"><label>Canceladas</label><div class="val">${cancelled.length}</div><div class="sub">${monthOrders.length} total</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div>
      <h2>Vendas por Dia</h2>
      <table>
        <thead><tr><th>Data</th><th class="tc">Vendas</th><th class="tr">Total</th><th class="tr">Base</th><th class="tr">IVA</th></tr></thead>
        <tbody>${daysRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Sem dados</td></tr>'}</tbody>
        <tr class="total-row"><td>TOTAL</td><td class="tc">${valid.length}</td><td class="tr">${f(total)} AKZ</td><td class="tr">${f(baseTrib)} AKZ</td><td class="tr">${f(ivaVal)} AKZ</td></tr>
      </table>
    </div>
    <div>
      <h2>Por Método de Pagamento</h2>
      <table>
        <thead><tr><th>Método</th><th class="tr">Nº</th><th class="tr">Total</th><th class="tr">%</th></tr></thead>
        <tbody>${payRows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem dados</td></tr>'}</tbody>
        <tr class="total-row"><td>TOTAL</td><td class="tr">${valid.length}</td><td class="tr">${f(total)} AKZ</td><td class="tr">100%</td></tr>
      </table>
    </div>
  </div>

  <h2>Detalhe de Todas as Vendas</h2>
  <table>
    <thead><tr><th>Nº Venda</th><th>Data/Hora</th><th>Cliente</th><th>NIF</th><th class="tc">Pagamento</th><th class="tr">IVA</th><th class="tr">Total</th><th class="tc">Estado</th></tr></thead>
    <tbody>${allRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">Sem vendas neste mês</td></tr>'}</tbody>
    <tr class="total-row"><td colspan="5">TOTAIS DO MÊS</td><td class="tr">${f(ivaVal)} AKZ</td><td class="tr">${f(total)} AKZ</td><td></td></tr>
  </table>

  ${reportFooter(settings)}
</body></html>`

  openPDF(html, `Vendas ${MONTHS_PT[month - 1]} ${year}`)
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. RELATÓRIO DE COMPRAS
// ══════════════════════════════════════════════════════════════════════════════
export function printPurchasesReport(purchases: Purchase[], settings: StoreSettings, from: string, to: string) {
  const filtered = purchases.filter(p => p.date.slice(0, 10) >= from && p.date.slice(0, 10) <= to)
  const total    = filtered.reduce((s, p) => s + p.total, 0)

  // Por fornecedor
  const bySupplier: Record<string, { count: number; total: number }> = {}
  filtered.forEach(p => {
    const s = p.supplier || 'Desconhecido'
    if (!bySupplier[s]) bySupplier[s] = { count: 0, total: 0 }
    bySupplier[s].count++
    bySupplier[s].total += p.total
  })

  // Por tipo
  const byType: Record<string, number> = {}
  filtered.forEach(p => { byType[p.type] = (byType[p.type] ?? 0) + p.total })

  const fromLabel = new Date(from + 'T12:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })
  const toLabel   = new Date(to   + 'T12:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })
  const typeLabel: Record<string, string> = { fornecedor: 'Fornecedor Externo', interno: 'Compra Interna' }

  const supplierRows = Object.entries(bySupplier)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, v]) => `
    <tr>
      <td class="bold">${name}</td>
      <td class="tc">${v.count}</td>
      <td class="tr bold">${f(v.total)} AKZ</td>
      <td class="tr">${pct(v.total, total)}</td>
    </tr>`).join('')

  const purchaseRows = filtered
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(p => {
      const itemsList = Array.isArray(p.items)
        ? p.items.map((i: any) => `${i.name} (${i.quantity} × ${f(i.unitPrice)} AKZ)`).join('; ')
        : '—'
      return `
      <tr>
        <td>${new Date(p.date + 'T12:00').toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
        <td class="bold">${p.supplier || '—'}</td>
        <td class="tc"><span class="badge badge-blue">${typeLabel[p.type] ?? p.type}</span></td>
        <td style="font-size:9px;color:#475569;max-width:200px">${itemsList}</td>
        <td class="tc">${p.paymentType || '—'}</td>
        <td class="tr bold red-t">${f(p.total)} AKZ</td>
      </tr>`
    }).join('')

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>Compras ${from} a ${to}</title>${baseCSS()}</head><body>
  ${reportHeader(settings, 'RELATÓRIO DE COMPRAS', `${fromLabel} a ${toLabel}`)}

  <div class="kpi-grid kpi-grid-3">
    <div class="kpi red"><label>Total Gasto em Compras</label><div class="val">${f(total)} AKZ</div><div class="sub">${filtered.length} compra(s)</div></div>
    <div class="kpi"><label>Nº de Fornecedores</label><div class="val">${Object.keys(bySupplier).length}</div></div>
    <div class="kpi"><label>Média por Compra</label><div class="val">${filtered.length > 0 ? f(total / filtered.length) : '0,00'} AKZ</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:4px">
    <div>
      <h2>Por Fornecedor</h2>
      <table>
        <thead><tr><th>Fornecedor</th><th class="tc">Compras</th><th class="tr">Total</th><th class="tr">%</th></tr></thead>
        <tbody>${supplierRows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem dados</td></tr>'}</tbody>
        <tr class="total-row"><td>TOTAL</td><td class="tc">${filtered.length}</td><td class="tr">${f(total)} AKZ</td><td class="tr">100%</td></tr>
      </table>
    </div>
    <div>
      <h2>Por Tipo</h2>
      <table>
        <thead><tr><th>Tipo</th><th class="tr">Total</th><th class="tr">%</th></tr></thead>
        <tbody>
          ${Object.entries(byType).map(([k, v]) => `
            <tr><td>${typeLabel[k] ?? k}</td><td class="tr bold">${f(v)} AKZ</td><td class="tr">${pct(v, total)}</td></tr>
          `).join('') || '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Sem dados</td></tr>'}
        </tbody>
        <tr class="total-row"><td>TOTAL</td><td class="tr">${f(total)} AKZ</td><td class="tr">100%</td></tr>
      </table>
    </div>
  </div>

  <h2>Detalhe de Todas as Compras</h2>
  <table>
    <thead><tr><th>Data</th><th>Fornecedor</th><th class="tc">Tipo</th><th>Artigos</th><th class="tc">Pagamento</th><th class="tr">Total (AKZ)</th></tr></thead>
    <tbody>${purchaseRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">Sem compras no período seleccionado</td></tr>'}</tbody>
    <tr class="total-row"><td colspan="5">TOTAL GASTO</td><td class="tr">${f(total)} AKZ</td></tr>
  </table>

  ${reportFooter(settings)}
</body></html>`

  openPDF(html, `Compras ${from} a ${to}`)
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. RELATÓRIO MENSAL COMPLETO (Vendas + Compras + Balanço)
// ══════════════════════════════════════════════════════════════════════════════
export function printMonthlyReport(
  orders: Order[],
  purchases: Purchase[],
  cashFlow: CashFlow[],
  settings: StoreSettings,
  year: number,
  month: number
) {
  const ivaRate = settings.iva_rate / 100

  const monthOrders = orders.filter(o => {
    const d = new Date(o.created_at)
    return d.getFullYear() === year && d.getMonth() + 1 === month && o.status !== 'cancelado'
  })
  const monthPurchases = purchases.filter(p => {
    const d = new Date(p.date)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })

  const revenue   = monthOrders.reduce((s, o) => s + o.total, 0)
  const costs     = monthPurchases.reduce((s, p) => s + p.total, 0)
  const ivaVal    = revenue - revenue / (1 + ivaRate)
  const lucro     = revenue - costs
  const lucroLiq  = lucro - ivaVal

  // Vendas por dia (barras mini)
  const byDay: Record<string, number> = {}
  monthOrders.forEach(o => {
    const d = o.created_at.slice(0, 10)
    byDay[d] = (byDay[d] ?? 0) + o.total
  })
  const maxDay = Math.max(...Object.values(byDay), 1)

  const dayRows = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => {
    const barW = Math.round((v / maxDay) * 120)
    return `
    <tr>
      <td>${new Date(d + 'T12:00').toLocaleDateString('pt-AO', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
      <td><div style="background:#0891b2;height:10px;width:${barW}px;border-radius:3px;min-width:2px"></div></td>
      <td class="tr bold">${f(v)} AKZ</td>
    </tr>`
  }).join('')

  // Top produtos
  const prodMap: Record<string, { qty: number; total: number }> = {}
  monthOrders.forEach(o => o.items?.forEach((i: any) => {
    const k = i.product_name
    if (!prodMap[k]) prodMap[k] = { qty: 0, total: 0 }
    prodMap[k].qty   += Number(i.quantity)
    prodMap[k].total += Number(i.total_price)
  }))
  const topProds = Object.entries(prodMap).sort(([, a], [, b]) => b.total - a.total).slice(0, 8)

  const topProdRows = topProds.map(([name, v], idx) => `
    <tr>
      <td class="tc bold">${idx + 1}</td>
      <td>${name}</td>
      <td class="tr">${v.qty.toFixed(2)} kg</td>
      <td class="tr bold">${f(v.total)} AKZ</td>
      <td class="tr">${pct(v.total, revenue)}</td>
    </tr>`).join('')

  const purchaseRows = monthPurchases.slice(0, 15).map(p => `
    <tr>
      <td>${new Date(p.date + 'T12:00').toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit' })}</td>
      <td class="bold">${p.supplier || '—'}</td>
      <td>${Array.isArray(p.items) ? p.items.length + ' artigo(s)' : '—'}</td>
      <td class="tc">${p.paymentType || '—'}</td>
      <td class="tr bold red-t">${f(p.total)} AKZ</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>Relatório ${MONTHS_PT[month-1]} ${year}</title>${baseCSS()}</head><body>
  ${reportHeader(settings, 'RELATÓRIO MENSAL COMPLETO', `${MONTHS_PT[month - 1]} de ${year}`)}

  <!-- KPIs principais -->
  <div class="kpi-grid kpi-grid-4">
    <div class="kpi green"><label>Total Faturado</label><div class="val">${f(revenue)} AKZ</div><div class="sub">${monthOrders.length} vendas</div></div>
    <div class="kpi red"><label>Total Compras</label><div class="val">${f(costs)} AKZ</div><div class="sub">${monthPurchases.length} compras</div></div>
    <div class="kpi ${lucro >= 0 ? 'green' : 'red'}"><label>Lucro Bruto</label><div class="val">${f(lucro)} AKZ</div><div class="sub">Margem: ${pct(lucro, revenue)}</div></div>
    <div class="kpi amber"><label>IVA a Entregar</label><div class="val">${f(ivaVal)} AKZ</div><div class="sub">Taxa ${settings.iva_rate}%</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <!-- Vendas por dia -->
    <div>
      <h2>Vendas por Dia</h2>
      <table>
        <thead><tr><th>Data</th><th>Volume</th><th class="tr">Total</th></tr></thead>
        <tbody>${dayRows || '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Sem vendas</td></tr>'}</tbody>
        <tr class="total-row"><td colspan="2">TOTAL MÊS</td><td class="tr">${f(revenue)} AKZ</td></tr>
      </table>
    </div>

    <!-- Top produtos -->
    <div>
      <h2>Top Produtos Vendidos</h2>
      <table>
        <thead><tr><th class="tc">#</th><th>Produto</th><th class="tr">Qtd (kg)</th><th class="tr">Total</th><th class="tr">%</th></tr></thead>
        <tbody>${topProdRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Sem dados</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- Compras -->
  <h2>Compras do Mês</h2>
  <table>
    <thead><tr><th>Data</th><th>Fornecedor</th><th>Artigos</th><th class="tc">Pagamento</th><th class="tr">Total</th></tr></thead>
    <tbody>${purchaseRows || '<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8">Sem compras este mês</td></tr>'}</tbody>
    <tr class="total-row"><td colspan="4">TOTAL COMPRAS</td><td class="tr">${f(costs)} AKZ</td></tr>
  </table>

  <!-- Balanço final -->
  <h2>Balanço do Mês</h2>
  <table>
    <thead><tr><th>Item</th><th class="tr">Valor (AKZ)</th></tr></thead>
    <tbody>
      <tr><td>Receitas (Vendas)</td><td class="tr green-t bold">${f(revenue)} AKZ</td></tr>
      <tr><td>Custos (Compras)</td><td class="tr red-t bold">-${f(costs)} AKZ</td></tr>
      <tr><td>Lucro Bruto</td><td class="tr bold">${f(lucro)} AKZ</td></tr>
      <tr><td>IVA (${settings.iva_rate}%) — a entregar à AGT</td><td class="tr bold">-${f(ivaVal)} AKZ</td></tr>
      <tr><td class="bold" style="font-size:12px">Lucro Líquido (após IVA)</td><td class="tr bold" style="font-size:13px;color:${lucroLiq >= 0 ? '#15803d' : '#b91c1c'}">${f(lucroLiq)} AKZ</td></tr>
    </tbody>
  </table>

  ${reportFooter(settings)}
</body></html>`

  openPDF(html, `Relatório ${MONTHS_PT[month - 1]} ${year}`)
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. RELATÓRIO DE FLUXO DE CAIXA
// ══════════════════════════════════════════════════════════════════════════════
export function printCashFlowReport(cashFlow: CashFlow[], settings: StoreSettings, from: string, to: string) {
  const filtered = cashFlow.filter(c => {
    const d = (c.created_at ?? '').slice(0, 10)
    return d >= from && d <= to
  })
  const entradas = filtered.filter(c => c.type === 'entrada').reduce((s, c) => s + c.amount, 0)
  const saidas   = filtered.filter(c => c.type === 'saida').reduce((s, c) => s + c.amount, 0)
  const saldo    = entradas - saidas

  const fromLabel = new Date(from + 'T12:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })
  const toLabel   = new Date(to   + 'T12:00').toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })

  const rows = filtered
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .map(c => `
    <tr>
      <td>${c.created_at ? new Date(c.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
      <td><span class="badge ${c.type === 'entrada' ? 'badge-green' : 'badge-red'}">${c.type === 'entrada' ? '▲ Entrada' : '▼ Saída'}</span></td>
      <td>${c.description}</td>
      <td>${c.order_number || '—'}</td>
      <td class="tc">${c.payment_type || '—'}</td>
      <td class="tr bold ${c.type === 'entrada' ? 'green-t' : 'red-t'}">${c.type === 'entrada' ? '+' : '-'}${f(c.amount)} AKZ</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>Caixa ${from} a ${to}</title>${baseCSS()}</head><body>
  ${reportHeader(settings, 'RELATÓRIO DE FLUXO DE CAIXA', `${fromLabel} a ${toLabel}`)}

  <div class="kpi-grid kpi-grid-3">
    <div class="kpi green"><label>Total Entradas</label><div class="val">${f(entradas)} AKZ</div><div class="sub">${filtered.filter(c => c.type === 'entrada').length} movimentos</div></div>
    <div class="kpi red"><label>Total Saídas</label><div class="val">${f(saidas)} AKZ</div><div class="sub">${filtered.filter(c => c.type === 'saida').length} movimentos</div></div>
    <div class="kpi ${saldo >= 0 ? 'green' : 'red'}"><label>Saldo do Período</label><div class="val">${f(saldo)} AKZ</div><div class="sub">${saldo >= 0 ? 'Positivo ✓' : 'Negativo ⚠'}</div></div>
  </div>

  <h2>Movimentos de Caixa</h2>
  <table>
    <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Descrição</th><th>Nº Venda</th><th class="tc">Pagamento</th><th class="tr">Valor</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">Sem movimentos no período seleccionado</td></tr>'}</tbody>
    <tr class="total-row">
      <td colspan="5">SALDO DO PERÍODO</td>
      <td class="tr">${saldo >= 0 ? '+' : ''}${f(saldo)} AKZ</td>
    </tr>
  </table>

  ${reportFooter(settings)}
</body></html>`

  openPDF(html, `Caixa ${from} a ${to}`)
}
