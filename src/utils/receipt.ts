/**
 * receipt.ts — Impressão térmica 80mm (42 colunas)
 * Usado pelo POS para talões de caixa rápidos.
 */
import type { Order } from '../types/database'
import type { StoreSettings } from '../lib/settings'

const COL = 42

function rline(left: string, right: string, width = COL): string {
  const gap = width - left.length - right.length
  return left + ' '.repeat(Math.max(1, gap)) + right
}
function rcenter(text: string, width = COL): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(pad) + text
}
function rdivider(char = '-', width = COL): string { return char.repeat(width) }
function rwrap(text: string, width = COL): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { if (cur) lines.push(cur); cur = w }
    else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur); return lines
}
function rfmt(n: number): string {
  return n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function printReceipt(order: Order, settings: StoreSettings): void {
  const items    = order.items ?? []
  const delivery = order.delivery_fee ?? 0
  const discount = order.discount_amount ?? 0
  const total    = order.total ?? 0
  const rows: string[] = []

  rows.push(rcenter(settings.name.toUpperCase()))
  if (settings.address) rows.push(rcenter(settings.address))
  if (settings.phone)   rows.push(rcenter('Tel: ' + settings.phone))
  if (settings.nif)     rows.push(rcenter('NIF: ' + settings.nif))
  rows.push(rdivider('='))
  rows.push(rcenter('TALAO DE VENDA'))
  rows.push(rdivider('='))
  rows.push(rline('N: ' + order.order_number, new Date(order.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })))
  if (order.customer_name)  rows.push('Cliente: ' + order.customer_name)
  rows.push(rdivider())
  rows.push(rline('ARTIGO + QTD', 'TOTAL'))
  rows.push(rdivider())

  for (const item of items) {
    const name  = item.product_name + ((item as any).preparation ? ' (' + (item as any).preparation + ')' : '')
    const nls   = rwrap(name, COL - 10)
    rows.push(rline(nls[0] ?? name, rfmt(item.total_price) + ' Kz'))
    rows.push('  ' + rfmt(item.unit_price) + ' x ' + Number(item.quantity).toFixed(3) + ' kg')
    for (let i = 1; i < nls.length; i++) rows.push('  ' + nls[i])
  }

  rows.push(rdivider())
  if (delivery > 0) rows.push(rline('Taxa entrega', rfmt(delivery) + ' Kz'))
  if (discount > 0) rows.push(rline('Desconto', '-' + rfmt(discount) + ' Kz'))
  const ivaRate = (settings.iva_rate ?? 14) / 100
  rows.push(rline('Base tributavel', rfmt(total / (1 + ivaRate)) + ' Kz'))
  rows.push(rline('IVA (' + (settings.iva_rate ?? 14) + '%)', rfmt(total - total / (1 + ivaRate)) + ' Kz'))
  rows.push(rdivider('='))
  rows.push(rline('TOTAL', rfmt(total) + ' Kz'))
  rows.push(rdivider('='))
  const payLabel: Record<string, string> = { dinheiro: 'Dinheiro', multicaixa: 'Multicaixa', express: 'Express' }
  if (order.payment_status === 'pendente') {
    rows.push(rline('Pagamento', 'FIADO (por pagar)'))
  } else if (order.payment_type === 'misto' && (order as any).payment_split?.length) {
    rows.push(rline('Pagamento', 'Dividido'))
    for (const s of (order as any).payment_split as { method: string; amount: number }[]) {
      rows.push(rline('  ' + (payLabel[s.method] ?? s.method), rfmt(s.amount) + ' Kz'))
    }
  } else {
    rows.push(rline('Pagamento', payLabel[order.payment_type] ?? order.payment_type))
  }
  rows.push(rdivider())
  rows.push(rcenter('Obrigado pela preferencia!'))
  if ((order as any).hash) rows.push(rcenter('Hash: ' + String((order as any).hash).slice(0, 8) + '...'))
  rows.push(rcenter('Peixaria Khrismir v1.5'))
  rows.push(''); rows.push(''); rows.push('')

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><title>Talao ${order.order_number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.4;color:#000;background:#fff;padding:4px 8px;width:80mm}pre{white-space:pre-wrap;font-family:inherit;font-size:inherit}@media print{body{padding:0}@page{margin:2mm;size:80mm auto}}</style>
</head><body><pre>${rows.join('\n')}</pre></body></html>`
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(html); win.document.close()
  setTimeout(() => win.print(), 400)
}
