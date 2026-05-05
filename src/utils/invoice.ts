import type { Order } from '../types/database'
import type { StoreSettings } from '../lib/settings'

// ── Utilitários ───────────────────────────────────────────────────────────────
const fmt2 = (n: number) =>
  n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Converte número para extenso em português (angolano)
function numToWords(n: number): string {
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove']
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const hundreds = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

  if (n === 0) return 'zero'
  let r = ''
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000)
    r += (m === 1 ? 'um milhão' : numToWords(m) + ' milhões') + ' '
    n %= 1000000
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000)
    r += (k === 1 ? 'mil' : numToWords(k) + ' mil') + ' '
    n %= 1000
  }
  if (n >= 100) {
    r += (n === 100 ? 'cem' : hundreds[Math.floor(n / 100)]) + ' '
    n %= 100
  }
  if (n >= 20) {
    r += tens[Math.floor(n / 10)]
    if (n % 10) r += ' e ' + units[n % 10]
    r += ' '
  } else if (n > 0) {
    r += units[n] + ' '
  }
  return r.trim()
}

function amountInWords(amount: number): string {
  const intPart = Math.floor(amount)
  const decPart = Math.round((amount - intPart) * 100)
  let r = numToWords(intPart).toUpperCase() + ' KWANZAS'
  if (decPart > 0) r += ' E ' + numToWords(decPart).toUpperCase() + ' CÊNTIMOS'
  return r
}

// ── Talão simples (POS / encomendas sem NIF) ──────────────────────────────────
export function printInvoice(order: Order, settings: StoreSettings) {
  const ivaRate  = settings.iva_rate / 100
  const subtotal = order.subtotal ?? order.items.reduce((s, i) => s + i.total_price, 0)
  const delivery = order.delivery_fee ?? 0
  const discount = order.discount_amount ?? 0
  const baseTrib = order.total / (1 + ivaRate)
  const ivaValor = order.total - baseTrib

  const payLabel: Record<string, string> = {
    dinheiro: 'Dinheiro', multicaixa: 'Multicaixa', express: 'Express'
  }

  const rows = order.items.map(i => `
    <tr>
      <td style="padding:4px 6px;border-bottom:1px solid #f0f0f0">${i.product_name}
        <span style="font-size:10px;color:#888"> (${i.preparation})</span></td>
      <td style="padding:4px 6px;border-bottom:1px solid #f0f0f0;text-align:center">${Number(i.quantity).toFixed(2)}&nbsp;kg</td>
      <td style="padding:4px 6px;border-bottom:1px solid #f0f0f0;text-align:right">${fmt2(i.unit_price)}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700">${fmt2(i.total_price)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8">
<title>Talão ${order.order_number}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;color:#333;padding:24px;max-width:780px;margin:0 auto}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #0891b2;margin-bottom:20px}
  .logo{font-size:22px;font-weight:900;color:#0891b2}
  .logo small{display:block;font-size:10px;font-weight:normal;color:#666;margin-top:2px}
  .doc-ref{text-align:right}
  .doc-ref h2{font-size:18px;font-weight:900;color:#1e293b}
  .doc-ref p{font-size:10px;color:#666}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:700;background:#dcfce7;color:#166534;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .box{background:#f8fafc;padding:10px 12px;border-radius:8px;font-size:11px}
  .box strong{display:block;font-size:9px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  thead th{background:#0891b2;color:#fff;padding:7px 6px;font-size:10px;text-transform:uppercase}
  thead th:not(:first-child){text-align:right}
  .totals{margin-left:auto;width:260px}
  .totals table{margin:0}
  .totals td{padding:4px 6px;font-size:11px}
  .totals td:last-child{text-align:right;font-weight:600}
  .tot-final td{border-top:2px solid #0891b2;font-size:14px;font-weight:900;color:#0891b2;padding-top:6px}
  .footer{margin-top:24px;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
  @media print{body{padding:10px}@page{margin:10mm}}
</style></head><body>
  <div class="hdr">
    <div>
      <div class="logo">${settings.name}<small>${settings.address}</small></div>
      <p style="margin-top:4px;font-size:10px;color:#64748b">Tel: ${settings.phone} &nbsp;|&nbsp; NIF: ${settings.nif} &nbsp;|&nbsp; ${settings.email}</p>
    </div>
    <div class="doc-ref">
      <h2>TALÃO DE VENDA</h2>
      <p style="font-size:13px;font-weight:700">${order.order_number}</p>
      <p>${new Date(order.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}</p>
      <span class="badge">${order.status === 'cancelado' ? 'CANCELADO' : 'ORIGINAL'}</span>
    </div>
  </div>

  <div class="grid2">
    <div class="box">
      <strong>Cliente</strong>
      <p>${order.customer_name || 'Consumidor Final'}</p>
      ${order.customer_phone ? `<p>Tel: ${order.customer_phone}</p>` : ''}
    </div>
    <div class="box">
      <strong>Detalhes</strong>
      <p>Entrega: ${order.delivery_type === 'delivery' ? 'Domicílio' : 'Levantamento na loja'}</p>
      <p>Pagamento: ${payLabel[order.payment_type] ?? order.payment_type}</p>
      ${order.delivery_address ? `<p>Morada: ${order.delivery_address}</p>` : ''}
      ${order.delivery_zone ? `<p>Zona: ${order.delivery_zone}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Descrição</th>
        <th>Qtd. (kg)</th>
        <th>Pr. Unitário</th>
        <th>Total (AKZ)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals"><table>
    <tr><td>Subtotal</td><td>${fmt2(subtotal)} AKZ</td></tr>
    ${delivery > 0 ? `<tr><td>Taxa entrega${order.delivery_zone ? ' ('+order.delivery_zone+')' : ''}</td><td>${fmt2(delivery)} AKZ</td></tr>` : ''}
    ${discount > 0 ? `<tr><td style="color:#16a34a">Desconto (${order.discount_code ?? ''})</td><td style="color:#16a34a">-${fmt2(discount)} AKZ</td></tr>` : ''}
    <tr><td>Base tributável</td><td>${fmt2(baseTrib)} AKZ</td></tr>
    <tr><td>IVA (${settings.iva_rate}%)</td><td>${fmt2(ivaValor)} AKZ</td></tr>
    <tr class="tot-final"><td>TOTAL (AKZ)</td><td>${fmt2(order.total)} AKZ</td></tr>
  </table></div>

  <div class="footer">
    <p>Hash: <strong>${order.hash ?? '————'}</strong> &nbsp;|&nbsp; SAF-T/AO 1.01.01 &nbsp;|&nbsp; Dec. Pres. n.º 71/25</p>
    <p>Processado por Peixaria Khrismir v1.5 &nbsp;•&nbsp; NIF: ${settings.nif}</p>
    <p style="margin-top:4px">Obrigado pela sua preferência!</p>
  </div>
</body></html>`

  open(html, order.order_number)
}

// ── Fatura/Recibo no formato AGT angolano (para empresas com NIF) ─────────────
export function printBusinessInvoice(order: Order, settings: StoreSettings) {
  const ivaRate  = settings.iva_rate / 100
  const subtotal = order.subtotal ?? order.items.reduce((s, i) => s + i.total_price, 0)
  const delivery = order.delivery_fee ?? 0
  const discount = order.discount_amount ?? 0
  const mercadoria = subtotal + delivery - discount
  const baseTrib = mercadoria / (1 + ivaRate)
  const ivaValor = mercadoria - baseTrib
  const total    = mercadoria
  const dataFmt  = new Date(order.created_at).toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const payLabel: Record<string, string> = {
    dinheiro: 'Pronto Pagamento', multicaixa: 'Multicaixa Express', express: 'Express'
  }

  const itemRows = order.items.map((i, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafafa'}">
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">${String(idx + 1).padStart(3,'0')}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">${i.product_name} (${i.preparation})</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">—</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">${Number(i.quantity).toFixed(2)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">KG</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt2(i.unit_price)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">0,00</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">${settings.iva_rate},00</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${fmt2(i.total_price)}</td>
    </tr>`).join('')

  const bankSection = settings.bank_name ? `
    <div style="margin-top:10px">
      <p style="font-size:9px;font-weight:700;margin-bottom:4px">Depósito/Transf. bancária</p>
      <table style="font-size:9px;border-top:1px solid #e2e8f0">
        <tr style="background:#f8fafc">
          <th style="padding:3px 6px;text-align:left;font-size:9px">Banco</th>
          <th style="padding:3px 6px;text-align:left;font-size:9px">N. Conta</th>
          <th style="padding:3px 6px;text-align:left;font-size:9px">Titular</th>
          <th style="padding:3px 6px;text-align:left;font-size:9px">IBAN</th>
        </tr>
        <tr>
          <td style="padding:3px 6px">${settings.bank_name}</td>
          <td style="padding:3px 6px">${settings.bank_account ?? ''}</td>
          <td style="padding:3px 6px">${settings.name}</td>
          <td style="padding:3px 6px">${settings.bank_iban ?? ''}</td>
        </tr>
      </table>
    </div>` : ''

  const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8">
<title>Fatura ${order.order_number}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:20px 24px;max-width:900px;margin:0 auto}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
  .company-name{font-size:20px;font-weight:900;color:#0f172a;letter-spacing:.5px}
  .doc-type{font-size:18px;font-weight:900;color:#1e293b;text-align:right}
  .doc-num{font-size:13px;color:#334155;text-align:right}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #cbd5e1;margin-bottom:8px}
  .info-cell{padding:8px 10px;border-right:1px solid #cbd5e1}
  .info-cell:last-child{border-right:none}
  .info-cell strong{display:block;font-size:9px;color:#64748b;margin-bottom:2px;text-transform:uppercase;letter-spacing:.4px}
  .meta-table{width:100%;border-collapse:collapse;border:1px solid #cbd5e1;margin-bottom:8px;font-size:10px}
  .meta-table th{background:#f1f5f9;padding:4px 8px;text-align:left;font-weight:600;color:#475569;border-bottom:1px solid #cbd5e1;border-right:1px solid #cbd5e1;font-size:9px}
  .meta-table td{padding:4px 8px;border-right:1px solid #cbd5e1}
  .items-table{width:100%;border-collapse:collapse;margin-bottom:0;font-size:10px}
  .items-table th{background:#1e293b;color:#fff;padding:5px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
  .items-table th:not(:nth-child(1)):not(:nth-child(2)){text-align:center}
  .items-table th:last-child{text-align:right}
  .totals-row{display:flex;justify-content:space-between;padding:2px 6px;font-size:10px}
  .totals-row.bold{font-weight:700;font-size:13px;border-top:2px solid #1e293b;padding-top:6px;margin-top:2px}
  .iva-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
  .iva-table th{background:#f1f5f9;padding:4px 8px;text-align:left;font-size:9px;color:#475569;border:1px solid #cbd5e1}
  .iva-table td{padding:4px 8px;border:1px solid #cbd5e1}
  .footer-line{font-size:8px;color:#64748b;margin-top:6px;border-top:1px solid #e2e8f0;padding-top:6px}
  @media print{body{padding:8px}@page{margin:8mm;size:A4}}
</style></head><body>

  <!-- CABEÇALHO -->
  <div class="hdr">
    <div>
      <div class="company-name">${settings.name}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px">
        ${settings.address}<br>
        Tel: ${settings.phone} &nbsp;|&nbsp; ${settings.email}<br>
        ${settings.cons_reg_com ? 'Cons. Reg. Com. ' + settings.cons_reg_com + '<br>' : ''}
        ${settings.capital_social ? 'Capital Social: ' + settings.capital_social + '<br>' : ''}
        <strong>Contribuinte N.º: ${settings.nif}</strong>
      </div>
    </div>
    <div>
      <div class="doc-type">Fatura/Recibo FR</div>
      <div class="doc-num" style="font-weight:700">FR ${order.order_number}</div>
      <div style="text-align:right;font-size:9px;color:#64748b;margin-top:4px">Original</div>
    </div>
  </div>

  <!-- CLIENTE -->
  <div class="info-grid">
    <div class="info-cell">
      <strong>Exmo.(s) Sr.(s) — Cliente</strong>
      <p style="font-size:12px;font-weight:700">${order.customer_name || 'Consumidor Final'}</p>
      ${order.customer_phone ? `<p>Tel: ${order.customer_phone}</p>` : ''}
      ${order.delivery_address ? `<p>${order.delivery_address}</p>` : ''}
    </div>
    <div class="info-cell">
      <strong>Dados Fiscais do Cliente</strong>
      ${order.customer_nif ? `<p><strong>NIF: ${order.customer_nif}</strong></p>` : '<p style="color:#94a3b8">Consumidor Final</p>'}
    </div>
  </div>

  <!-- META FIELDS -->
  <table class="meta-table">
    <tr>
      <th>V/N.º Contrib.</th>
      <th>Requisição</th>
      <th>Moeda</th>
      <th>Data</th>
      <th>Vencimento</th>
      <th>Condição Pagamento</th>
    </tr>
    <tr>
      <td>${order.customer_nif || settings.nif}</td>
      <td>${order.order_number}</td>
      <td>AKZ</td>
      <td>${dataFmt}</td>
      <td>${dataFmt}</td>
      <td>${payLabel[order.payment_type] ?? order.payment_type}</td>
    </tr>
  </table>

  <!-- ARTIGOS -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:40px">Artigo</th>
        <th>Descrição</th>
        <th style="width:60px">Armazém</th>
        <th style="width:50px">Qtd.</th>
        <th style="width:35px">Un.</th>
        <th style="width:90px;text-align:right">Pr. Unitário</th>
        <th style="width:50px">Desc.</th>
        <th style="width:40px">IVA</th>
        <th style="width:90px;text-align:right">Valor (AKZ)</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- RODAPÉ COM TOTAIS E IVA -->
  <div style="display:flex;gap:16px;margin-top:8px;font-size:10px">

    <!-- Quadro Resumo de Impostos -->
    <div style="flex:0 0 240px">
      <p style="font-size:9px;font-weight:700;margin-bottom:4px;color:#475569">Quadro Resumo de Impostos</p>
      <table class="iva-table">
        <tr>
          <th>Taxa/Valor</th>
          <th>Incid./Qtd.</th>
          <th>Total</th>
        </tr>
        <tr>
          <td>IVA (${settings.iva_rate},00)</td>
          <td>${fmt2(baseTrib)}</td>
          <td style="font-weight:700">${fmt2(ivaValor)}</td>
        </tr>
      </table>
      ${bankSection}
    </div>

    <!-- Totais -->
    <div style="flex:1">
      <div class="totals-row"><span>Mercadoria/Serviços</span><span>${fmt2(mercadoria)}</span></div>
      <div class="totals-row"><span>Desconto Comercial</span><span>0,00</span></div>
      <div class="totals-row"><span>Desconto Adicional</span><span>0,00</span></div>
      <div class="totals-row"><span>Portes</span><span>${fmt2(delivery)}</span></div>
      <div class="totals-row"><span>Outros Serviços</span><span>0,00</span></div>
      <div class="totals-row"><span>Adiantamentos</span><span>0,00</span></div>
      <div class="totals-row"><span>IEC/Outras Contribuições</span><span>0,00</span></div>
      <div class="totals-row"><span>IVA</span><span>${fmt2(ivaValor)}</span></div>
      <div class="totals-row"><span>Acerto</span><span>0,00</span></div>
      <div class="totals-row bold"><span>Total (AKZ)</span><span>${fmt2(total)}</span></div>
    </div>
  </div>

  <!-- EXTENSO -->
  <p style="font-size:10px;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px">
    Recebemos relativamente ao pagamento da Fatura/Recibo FR ${order.order_number}, a quantia de<br>
    <strong>${amountInWords(total)}.</strong>
  </p>

  <!-- RODAPÉ FISCAL -->
  <div class="footer-line">
    EBOK-Processado por programa validado n.º FE/4/AGT/2025 &nbsp;|&nbsp; Os bens e/ou serviços foram colocados à disposição na data ${dataFmt} &nbsp;|&nbsp; Peixaria Khrismir v1.5<br>
    Hash: <strong>${order.hash ?? '————'}</strong> &nbsp;|&nbsp; SAF-T/AO 1.01.01 &nbsp;|&nbsp; Dec. Pres. n.º 71/25 &nbsp;|&nbsp; NIF: ${settings.nif}
  </div>
</body></html>`

  open(html, order.order_number)
}

function open(html: string, title: string) {
  const win = window.open('', '_blank', 'width=960,height=750')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}
