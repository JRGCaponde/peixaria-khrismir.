import type { Order } from '../types/database'
import type { StoreSettings } from '../lib/settings'

export function printInvoice(order: Order, settings: StoreSettings) {
  const ivaRate = settings.iva_rate / 100
  const subtotal = order.subtotal ?? order.items.reduce((s, i) => s + i.total_price, 0)
  const deliveryFee = order.delivery_fee ?? 0
  const discount = order.discount_amount ?? 0
  const ivaValue = order.total * ivaRate
  const netTotal = order.total / (1 + ivaRate)

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${item.product_name} (${item.preparation})</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center">${Number(item.quantity).toFixed(2)} kg</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${Number(item.unit_price).toLocaleString('pt-AO')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600">${Number(item.total_price).toLocaleString('pt-AO')}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Fatura ${order.order_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #333; padding: 30px; max-width: 800px; margin: 0 auto }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; padding-bottom:20px; border-bottom:3px solid #0891b2 }
    .logo { font-size:22px; font-weight:900; color:#0891b2 }
    .logo small { display:block; font-size:11px; font-weight:normal; color:#666; margin-top:2px }
    .invoice-title { text-align:right }
    .invoice-title h2 { font-size:20px; font-weight:900; color:#333 }
    .invoice-title p { color:#666; font-size:11px }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:25px }
    .info-box { background:#f8fafc; padding:12px; border-radius:8px }
    .info-box strong { display:block; font-size:10px; text-transform:uppercase; color:#888; margin-bottom:6px; letter-spacing:.5px }
    table { width:100%; border-collapse:collapse; margin-bottom:20px }
    thead th { background:#0891b2; color:white; padding:8px; text-align:left; font-size:11px; text-transform:uppercase }
    thead th:not(:first-child) { text-align:right }
    .totals { margin-left:auto; width:280px }
    .totals table { margin:0 }
    .totals td { padding:5px 8px; font-size:12px }
    .totals td:last-child { text-align:right; font-weight:600 }
    .total-final td { border-top:2px solid #0891b2; padding-top:8px; font-size:14px; font-weight:900; color:#0891b2 }
    .footer { margin-top:30px; text-align:center; font-size:10px; color:#999; border-top:1px solid #eee; padding-top:15px }
    .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; background:#dcfce7; color:#166534 }
    @media print { body { padding:15px } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">${settings.name}<small>${settings.address}</small></div>
      <p style="margin-top:4px;font-size:11px;color:#666">Tel: ${settings.phone} | NIF: ${settings.nif}</p>
    </div>
    <div class="invoice-title">
      <h2>FATURA / RECIBO</h2>
      <p>${order.order_number}</p>
      <p>${new Date(order.created_at).toLocaleString('pt-AO')}</p>
      <span class="badge">${order.status === 'cancelado' ? 'CANCELADO' : 'VÁLIDO'}</span>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <strong>Cliente</strong>
      <p>${order.customer_name || 'Consumidor Final'}</p>
      ${order.customer_nif ? `<p>NIF: ${order.customer_nif}</p>` : ''}
      ${order.customer_phone ? `<p>Tel: ${order.customer_phone}</p>` : ''}
    </div>
    <div class="info-box">
      <strong>Detalhes</strong>
      <p>Entrega: ${order.delivery_type === 'delivery' ? '🚚 Domicílio' : '🏪 Retirada na Loja'}</p>
      <p>Pagamento: ${order.payment_type}</p>
      ${order.delivery_address ? `<p>Endereço: ${order.delivery_address}</p>` : ''}
      ${order.delivery_zone ? `<p>Zona: ${order.delivery_zone}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Descrição</th>
        <th style="text-align:center">Qtd. (kg)</th>
        <th style="text-align:right">Preço Unit.</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td>${subtotal.toLocaleString('pt-AO')} AOA</td></tr>
      ${deliveryFee > 0 ? `<tr><td>Taxa de entrega (${order.delivery_zone || ''})</td><td>${deliveryFee.toLocaleString('pt-AO')} AOA</td></tr>` : ''}
      ${discount > 0 ? `<tr><td style="color:#16a34a">Desconto (${order.discount_code})</td><td style="color:#16a34a">-${discount.toLocaleString('pt-AO')} AOA</td></tr>` : ''}
      <tr><td>Base tributável</td><td>${netTotal.toLocaleString('pt-AO', { maximumFractionDigits: 2 })} AOA</td></tr>
      <tr><td>IVA (${settings.iva_rate}%)</td><td>${ivaValue.toLocaleString('pt-AO', { maximumFractionDigits: 2 })} AOA</td></tr>
      <tr class="total-final"><td>TOTAL</td><td>${order.total.toLocaleString('pt-AO')} AOA</td></tr>
    </table>
  </div>

  <div class="footer">
    <p style="font-family:monospace;font-size:11px;color:#555;letter-spacing:1px;margin-bottom:6px">
      Hash: <strong>${order.hash || '————'}</strong> &nbsp;|&nbsp; HashControl: 1 &nbsp;|&nbsp; SAF-T/AO 1.01.01
    </p>
    <p>Processado por Peixaria Khrismir v1.5 — Dec. Pres. n.º 71/25 • NIF: ${settings.nif}</p>
    <p style="margin-top:4px">${settings.email} | ${settings.phone}</p>
    <p style="margin-top:2px">Obrigado pela sua preferência!</p>
  </div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => { win.print() }, 500)
}
