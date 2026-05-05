import type { Order } from '../types/database'
import type { StoreSettings } from '../lib/settings'

const fmt = (n: number) =>
  n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function printReceipt(order: Order, settings: StoreSettings) {
  const ivaRate = settings.iva_rate / 100
  const subtotal  = order.subtotal ?? order.items.reduce((s, i) => s + i.total_price, 0)
  const delivery  = order.delivery_fee ?? 0
  const discount  = order.discount_amount ?? 0
  const baseTrib  = order.total / (1 + ivaRate)
  const ivaValor  = order.total - baseTrib

  const rows = order.items.map(i => `
    <tr>
      <td>${i.product_name}<br><small style="color:#555">${i.preparation}</small></td>
      <td style="text-align:center">${Number(i.quantity).toFixed(2)}&nbsp;kg</td>
      <td style="text-align:right">${fmt(i.unit_price)}</td>
      <td style="text-align:right;font-weight:700">${fmt(i.total_price)}</td>
    </tr>`).join('')

  const payLabel: Record<string, string> = {
    dinheiro: 'Dinheiro', multicaixa: 'Multicaixa', express: 'Express'
  }

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Talão ${order.order_number}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:11px;color:#000;width:80mm;margin:0 auto;padding:6px 8px}
    .c{text-align:center}
    .b{font-weight:700}
    .sep{border:none;border-top:1px dashed #000;margin:5px 0}
    .sep2{border:none;border-top:2px solid #000;margin:5px 0}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{text-align:left;border-bottom:1px solid #000;padding:2px 0;font-size:10px}
    td{padding:2px 0;vertical-align:top}
    .r{text-align:right}
    .row{display:flex;justify-content:space-between;padding:1px 0}
    .tot{display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding:3px 0}
    @media print{body{width:80mm}@page{margin:0;size:80mm auto}}
  </style>
</head>
<body>
  <div class="c b" style="font-size:15px">${settings.name}</div>
  <div class="c" style="font-size:9px">${settings.address}</div>
  <div class="c" style="font-size:9px">Tel: ${settings.phone} &nbsp;|&nbsp; NIF: ${settings.nif}</div>
  <hr class="sep2">

  <div class="row"><span>Talão N.º:</span><span class="b">${order.order_number}</span></div>
  <div class="row"><span>Data:</span><span>${new Date(order.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
  <div class="row"><span>Pagamento:</span><span>${payLabel[order.payment_type] ?? order.payment_type}</span></div>
  <div class="row"><span>Tipo:</span><span>${order.delivery_type === 'delivery' ? 'Entrega ao domicílio' : 'Levantamento na loja'}</span></div>
  ${order.customer_name ? `<div class="row"><span>Cliente:</span><span>${order.customer_name}</span></div>` : ''}
  ${order.delivery_address ? `<div class="row"><span>Endereço:</span><span style="max-width:50mm;text-align:right">${order.delivery_address}</span></div>` : ''}

  <hr class="sep">
  <table>
    <thead>
      <tr>
        <th>Artigo</th>
        <th style="text-align:center">Qtd</th>
        <th style="text-align:right">P.Unit</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <hr class="sep">

  <div class="row"><span>Subtotal</span><span>${fmt(subtotal)} AKZ</span></div>
  ${delivery > 0 ? `<div class="row"><span>Entrega${order.delivery_zone ? ' ('+order.delivery_zone+')' : ''}</span><span>${fmt(delivery)} AKZ</span></div>` : ''}
  ${discount > 0 ? `<div class="row"><span>Desconto${order.discount_code ? ' ('+order.discount_code+')' : ''}</span><span>-${fmt(discount)} AKZ</span></div>` : ''}
  <div class="row"><span>Base tributável</span><span>${fmt(baseTrib)} AKZ</span></div>
  <div class="row"><span>IVA (${settings.iva_rate}%)</span><span>${fmt(ivaValor)} AKZ</span></div>

  <hr class="sep2">
  <div class="tot"><span>TOTAL</span><span>${fmt(order.total)} AKZ</span></div>
  <hr class="sep2">

  <div class="c" style="font-size:8px;margin-top:6px">
    Hash: ${order.hash ?? '————'}<br>
    Processado por Peixaria Khrismir v1.5<br>
    Dec. Pres. n.º 71/25 &nbsp;•&nbsp; NIF: ${settings.nif}
  </div>
  <div class="c b" style="margin-top:8px">Obrigado pela sua preferência!</div>
  <br><br>
</body>
</html>`

  const win = window.open('', '_blank', 'width=380,height=650')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}
