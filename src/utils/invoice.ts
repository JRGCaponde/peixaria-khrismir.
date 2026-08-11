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
      <p>Pagamento: ${
        order.payment_status === 'pendente' ? 'FIADO (por pagar)' :
        order.payment_type === 'misto' && (order as any).payment_split?.length
          ? 'Dividido — ' + (order as any).payment_split.map((s: { method: string; amount: number }) => `${payLabel[s.method] ?? s.method}: ${s.amount.toLocaleString('pt-AO')} Kz`).join(', ')
          : (payLabel[order.payment_type] ?? order.payment_type)
      }</p>
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

// ── Factura no formato AGT angolano (para empresas com NIF) ───────────────────
export function printBusinessInvoice(order: Order, settings: StoreSettings, usdRate = 86.85) {
  const ivaRate    = settings.iva_rate / 100
  const subtotal   = order.subtotal ?? order.items.reduce((s, i) => s + i.total_price, 0)
  const delivery   = order.delivery_fee ?? 0
  const discount   = order.discount_amount ?? 0
  const mercadoria = subtotal - discount
  const total      = mercadoria + delivery
  const isExempt   = settings.iva_rate === 0
  const baseTrib   = isExempt ? total : total / (1 + ivaRate)
  const ivaValor   = isExempt ? 0 : total - baseTrib
  const totalUsd   = total / usdRate

  const dt       = new Date(order.created_at)
  const dataISO  = dt.toISOString().slice(0, 10)
  const year     = dt.getFullYear()
  const timeStr  = dt.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })

  // Número do documento: FT FA.2026/183 (vendas normais) ou FA/FP 2026/001 (facturas manuais)
  const seq = order.order_number.includes('/') ? order.order_number : `${year}/${order.order_number}`
  const isFP = order.doc_type === 'FP'
  const docRef = order.doc_type ? `${order.doc_type} ${seq}` : `FT FA.${seq}`

  const payLabel: Record<string, string> = {
    dinheiro: 'Pronto Pagamento', multicaixa: 'Multicaixa Express', express: 'Express'
  }

  // Coluna IVA por linha: "(90) 0,00" quando isento, ou "XX%" quando tributado
  const ivaCol = (itemTotal: number) =>
    isExempt
      ? '(90)&nbsp;0,00'
      : `${fmt2(itemTotal * ivaRate)}`

  const itemRows = order.items.map((i, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafafa'}">
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">P${String(idx + 1).padStart(3, '0')}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">${i.product_name}${i.preparation ? ' (' + i.preparation + ')' : ''}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">${Number(i.quantity).toFixed(2)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">KG</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt2(i.unit_price)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">0,00</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;white-space:nowrap">${ivaCol(i.total_price)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${fmt2(i.total_price)}</td>
    </tr>`).join('')

  const bankSection = settings.bank_name ? `
    <div style="margin-top:10px">
      <p style="font-size:9px;font-weight:700;margin-bottom:4px">Depósito/Transf. bancária</p>
      <table style="width:100%;font-size:9px;border-collapse:collapse;border:1px solid #e2e8f0">
        <tr style="background:#f8fafc">
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">Banco</th>
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">N. Conta</th>
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">Titular</th>
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">IBAN</th>
        </tr>
        <tr>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.bank_name}</td>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.bank_account ?? ''}</td>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.name}</td>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.bank_iban ?? ''}</td>
        </tr>
      </table>
    </div>` : ''

  // Secção Carga/Descarga (quando há entrega)
  const cargaSection = `
    <div style="display:flex;gap:24px;margin-top:10px;font-size:9px;border-top:1px solid #e2e8f0;padding-top:8px">
      <div style="flex:1">
        <p style="font-weight:700;margin-bottom:4px">Carga</p>
        <p>N/ Morada — ${dataISO} / ${timeStr}</p>
        ${settings.address ? `<p>${settings.address}</p>` : ''}
        <p>Angola</p>
      </div>
      <div style="flex:1">
        <p style="font-weight:700;margin-bottom:4px">Descarga</p>
        <p>V/ Morada</p>
        ${order.delivery_address ? `<p>${order.delivery_address}</p>` : ''}
        ${order.delivery_zone ? `<p>${order.delivery_zone}</p>` : ''}
        <p>Angola</p>
      </div>
    </div>`

  const ivaMotivo = isExempt ? 'Transmissão de bens e serviço não sujeita' : ''
  const ivaLabel  = isExempt ? 'IVA (0,00)' : `IVA (${settings.iva_rate},00)`

  const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8">
<title>Factura ${docRef}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:20px 24px;max-width:940px;margin:0 auto}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:1px solid #cbd5e1;margin-bottom:10px}
  .company-name{font-size:18px;font-weight:900;color:#0f172a}
  .meta-table{width:100%;border-collapse:collapse;border:1px solid #cbd5e1;margin-bottom:8px;font-size:10px}
  .meta-table th{background:#f1f5f9;padding:4px 8px;text-align:left;font-weight:600;color:#475569;border:1px solid #cbd5e1;font-size:9px}
  .meta-table td{padding:4px 8px;border:1px solid #cbd5e1}
  .items-table{width:100%;border-collapse:collapse;margin-bottom:0;font-size:10px}
  .items-table th{background:#1e293b;color:#fff;padding:5px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
  .items-table th:not(:nth-child(1)):not(:nth-child(2)){text-align:center}
  .items-table th:last-child{text-align:right}
  .totals-row{display:flex;justify-content:space-between;padding:2px 8px;font-size:10px}
  .totals-row.sep{border-top:1px solid #e2e8f0;padding-top:4px;margin-top:2px}
  .iva-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
  .iva-table th{background:#f1f5f9;padding:4px 8px;text-align:left;font-size:9px;color:#475569;border:1px solid #cbd5e1}
  .iva-table td{padding:4px 8px;border:1px solid #cbd5e1}
  .footer-line{font-size:8px;color:#64748b;margin-top:8px;border-top:1px solid #e2e8f0;padding-top:6px}
  @media print{body{padding:8px}@page{margin:8mm;size:A4}}
</style></head><body>

  ${isFP ? `<div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:8px;padding:8px 12px;margin-bottom:10px;text-align:center">
    <span style="color:#b45309;font-weight:900;font-size:13px;letter-spacing:.5px">DOCUMENTO PROVISÓRIO — SEM VALOR FISCAL, válido apenas como orçamento</span>
  </div>` : ''}

  <!-- CABEÇALHO -->
  <div class="hdr">
    <div>
      <div class="company-name">${settings.name}</div>
      <div style="font-size:9px;color:#475569;margin-top:4px;line-height:1.6">
        ${settings.address ? settings.address + '<br>' : ''}
        ${settings.phone ? 'Telef. ' + settings.phone + '<br>' : ''}
        ${settings.email ? settings.email + '<br>' : ''}
        ${settings.cons_reg_com ? 'Cons. Reg. Com. ' + settings.cons_reg_com + '<br>' : ''}
        ${settings.capital_social ? 'Capital Social ' + settings.capital_social + '<br>' : ''}
        <strong>Contribuinte N.º: ${settings.nif}</strong>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:900;color:#0f172a;letter-spacing:1px">${settings.name.split(' ').map((w: string) => w[0]).join('').toUpperCase()}</div>
      <div style="font-size:10px;font-weight:700;color:#334155;margin-top:2px">${settings.name.toUpperCase()}</div>
      ${settings.nif ? `<div style="font-size:9px;color:#64748b">NIF: ${settings.nif}${settings.phone ? ' · TEL: ' + settings.phone : ''}</div>` : ''}
    </div>
  </div>

  <!-- DESTINATÁRIO -->
  <div style="display:flex;justify-content:space-between;margin-bottom:10px">
    <div style="font-size:10px;line-height:1.7">
      <span style="color:#475569">Exmo.(s) Sr.(s)</span><br>
      <strong style="font-size:12px">${order.customer_name || 'Consumidor Final'}</strong><br>
      ${order.customer_nif ? `NIF: ${order.customer_nif}<br>` : ''}
      ${order.delivery_address ? order.delivery_address + '<br>' : ''}
      ${order.delivery_zone ? order.delivery_zone : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:900;margin-bottom:2px">${isFP ? 'Factura Proforma' : 'Factura'} ${docRef}</div>
      <div style="font-size:10px;color:#64748b">${isFP ? 'Proforma' : 'Original'}</div>
    </div>
  </div>

  <!-- META TABLE (2 linhas como no modelo AGT) -->
  <table class="meta-table">
    <tr>
      <th>V/N.º Contrib.</th>
      <th>Requisição</th>
      <th>Moeda</th>
      <th>Câmbio</th>
      <th>Data</th>
    </tr>
    <tr>
      <td>${order.customer_nif || ''}</td>
      <td></td>
      <td>AKZ</td>
      <td>${fmt2(usdRate)}</td>
      <td>${dataISO}</td>
    </tr>
    <tr>
      <th>Desc. Cli.</th>
      <th>Desc. Fin.</th>
      <th>Vencimento</th>
      <th colspan="2">Condição Pagamento</th>
    </tr>
    <tr>
      <td>0,00</td>
      <td>0,00</td>
      <td>${dataISO}</td>
      <td colspan="2">${payLabel[order.payment_type] ?? order.payment_type}</td>
    </tr>
  </table>

  <!-- ARTIGOS -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:45px">Artigo</th>
        <th>Descrição</th>
        <th style="width:55px">Qtd.</th>
        <th style="width:35px">Un.</th>
        <th style="width:95px;text-align:right">Pr. Unitário</th>
        <th style="width:50px">Desc.</th>
        <th style="width:65px">IVA</th>
        <th style="width:95px;text-align:right">Valor</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- LINHA DE CERTIFICAÇÃO AGT -->
  <p style="font-size:8px;color:#64748b;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:4px 6px;margin:0">
    O+S0-Processado por programa validado n.º 41/AGT/2019 &nbsp;|&nbsp; Os bens foram colocados à disposição na data ${dataISO} &nbsp;|&nbsp; Peixaria Khrismir v1.5
  </p>

  <!-- RODAPÉ COM TOTAIS E IVA -->
  <div style="display:flex;gap:16px;margin-top:8px;font-size:10px">

    <!-- Esquerda: isenção + IVA table + banco -->
    <div style="flex:0 0 320px">
      ${isExempt ? `<p style="font-size:9px;font-style:italic;margin-bottom:4px;color:#475569">Transmissão de bens e serviço não sujeita</p>` : ''}
      <p style="font-size:9px;font-weight:700;margin-bottom:4px;color:#475569">Quadro Resumo de Impostos</p>
      <table class="iva-table">
        <tr>
          <th>Taxa/Valor</th>
          <th>Incid./Qtd.</th>
          <th>Total</th>
          <th>Motivo Isenção</th>
        </tr>
        <tr>
          <td>${ivaLabel}</td>
          <td style="text-align:center">${isExempt ? '(90)' : ''}&nbsp;${fmt2(baseTrib)}</td>
          <td style="text-align:right;font-weight:700">${fmt2(ivaValor)}</td>
          <td style="font-size:8px;color:#475569">${ivaMotivo}</td>
        </tr>
      </table>
      ${bankSection}
    </div>

    <!-- Direita: totais -->
    <div style="flex:1">
      <div class="totals-row"><span>Mercadoria/Serviços</span><span>${fmt2(mercadoria)}</span></div>
      <div class="totals-row"><span>Descontos Comerciais</span><span>0,00</span></div>
      <div class="totals-row"><span>Desconto Financeiro</span><span>0,00</span></div>
      <div class="totals-row"><span>Portes</span><span>${fmt2(delivery)}</span></div>
      <div class="totals-row"><span>Outros Serviços</span><span>0,00</span></div>
      <div class="totals-row"><span>Adiantamentos</span><span>0,00</span></div>
      <div class="totals-row"><span>IEC/Outras Contribuições</span><span>0,00</span></div>
      <div class="totals-row"><span>Acerto</span><span>0,00</span></div>
      <div class="totals-row sep" style="border-top:2px solid #1e293b;padding-top:6px;margin-top:4px">
        <span style="font-size:15px;font-weight:900">Total ( AKZ )</span>
        <span style="font-size:15px;font-weight:900">${fmt2(total)}</span>
      </div>
      <div class="totals-row" style="color:#64748b">
        <span>Total ( USD )</span>
        <span>${fmt2(totalUsd)}</span>
      </div>
    </div>
  </div>

  ${cargaSection}

  <!-- EXTENSO -->
  <p style="font-size:10px;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px">
    ${isFP ? `Orçamento referente à Factura Proforma ${docRef}, no valor de` : `Recebemos relativamente ao pagamento da Factura ${docRef}, a quantia de`}<br>
    <strong>${amountInWords(total)}.</strong>
  </p>

  <!-- RODAPÉ FISCAL -->
  <div class="footer-line">
    ${isFP
      ? 'Documento sem valor fiscal — não reportado à AGT.'
      : `Hash: <strong>${order.hash ?? '————'}</strong> &nbsp;|&nbsp; SAF-T/AO 1.01.01 &nbsp;|&nbsp; Dec. Pres. n.º 71/25 &nbsp;|&nbsp; NIF: ${settings.nif}`}
  </div>
</body></html>`

  open(html, docRef)
}

// ── Documento PRIMAVERA (Venda Directa / Factura / Nota de Crédito) ──────────
export interface PrimaveraDocInfo {
  doc_type: string
  doc_number: number
  doc_series: string | null
  total_net: number | null
  total_vat: number | null
}

const docTypeLabel: Record<string, string> = {
  VD2:  'Venda Directa',
  VD1:  'Venda Directa',
  VD:   'Venda Directa',
  FA:   'Factura',
  FR:   'Factura-Recibo',
  NC:   'Nota de Crédito',
  VNC:  'Nota de Crédito',
  RC:   'Recibo',
}

export function printPrimaveraInvoice(
  order: any,
  sale: PrimaveraDocInfo | null,
  settings: StoreSettings,
) {
  const docSeries  = sale?.doc_series ?? ''
  const docNumber  = sale?.doc_number ?? ''
  const docType    = sale?.doc_type   ?? 'VD2'
  const docLabel   = docTypeLabel[docType] ?? docType
  const isNC       = docType === 'NC' || docType === 'VNC'
  const docRef     = docSeries ? `${docSeries}/${docNumber}` : String(docNumber)
  const fullDocRef = `${docLabel} ${docRef}`.trim()

  const items: any[] = order.items ?? []
  const totalAbs  = Math.abs(Number(order.total ?? 0))
  const totalNet  = sale?.total_net  != null ? Math.abs(Number(sale.total_net))  : totalAbs / 1.14
  const totalVat  = sale?.total_vat  != null ? Math.abs(Number(sale.total_vat))  : totalAbs - totalNet
  const ivaRate   = totalNet > 0 ? Math.round((totalVat / totalNet) * 100) : settings.iva_rate
  const isExempt  = ivaRate === 0

  const dt       = new Date((order.created_at ?? '').replace(' ', 'T'))
  const dataISO  = dt.toISOString().slice(0, 10)
  const timeStr  = dt.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })

  const ivaLabel  = isExempt ? 'IVA (0,00)' : `IVA (${ivaRate},00)`
  const ivaMotivo = isExempt ? 'Transmissão de bens e serviço não sujeita' : ''

  const itemRows = items.map((i: any, idx: number) => {
    const qty   = Number(i.quantity  ?? 0)
    const price = Number(i.unit_price ?? 0)
    const total = Number(i.total_price ?? 0)
    const ivaCell = isExempt ? '(90)&nbsp;0,00' : fmt2(total * (ivaRate / 100))
    return `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafafa'}">
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">P${String(idx + 1).padStart(3, '0')}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">${i.product_name ?? ''}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">${qty.toFixed(3)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">KG</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt2(price)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center">0,00</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;white-space:nowrap">${ivaCell}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${fmt2(total)}</td>
    </tr>`
  }).join('')

  const bankSection = settings.bank_name ? `
    <div style="margin-top:10px">
      <p style="font-size:9px;font-weight:700;margin-bottom:4px">Depósito/Transf. bancária</p>
      <table style="width:100%;font-size:9px;border-collapse:collapse;border:1px solid #e2e8f0">
        <tr style="background:#f8fafc">
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">Banco</th>
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">N. Conta</th>
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">Titular</th>
          <th style="padding:3px 6px;text-align:left;border:1px solid #e2e8f0">IBAN</th>
        </tr>
        <tr>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.bank_name}</td>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.bank_account ?? ''}</td>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.name}</td>
          <td style="padding:3px 6px;border:1px solid #e2e8f0">${settings.bank_iban ?? ''}</td>
        </tr>
      </table>
    </div>` : ''

  const ncBanner = isNC ? `
    <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:8px 12px;margin-bottom:10px;text-align:center">
      <span style="color:#dc2626;font-weight:900;font-size:14px;letter-spacing:1px">⚠ NOTA DE CRÉDITO — DOCUMENTO ANULADOR</span>
    </div>` : ''

  const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8">
<title>${fullDocRef}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:20px 24px;max-width:940px;margin:0 auto}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:1px solid #cbd5e1;margin-bottom:10px}
  .company-name{font-size:18px;font-weight:900;color:#0f172a}
  .meta-table{width:100%;border-collapse:collapse;border:1px solid #cbd5e1;margin-bottom:8px;font-size:10px}
  .meta-table th{background:#f1f5f9;padding:4px 8px;text-align:left;font-weight:600;color:#475569;border:1px solid #cbd5e1;font-size:9px}
  .meta-table td{padding:4px 8px;border:1px solid #cbd5e1}
  .items-table{width:100%;border-collapse:collapse;margin-bottom:0;font-size:10px}
  .items-table th{background:#1e293b;color:#fff;padding:5px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
  .items-table th:not(:nth-child(1)):not(:nth-child(2)){text-align:center}
  .items-table th:last-child{text-align:right}
  .totals-row{display:flex;justify-content:space-between;padding:2px 8px;font-size:10px}
  .totals-row.sep{border-top:1px solid #e2e8f0;padding-top:4px;margin-top:2px}
  .iva-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
  .iva-table th{background:#f1f5f9;padding:4px 8px;text-align:left;font-size:9px;color:#475569;border:1px solid #cbd5e1}
  .iva-table td{padding:4px 8px;border:1px solid #cbd5e1}
  .footer-line{font-size:8px;color:#64748b;margin-top:8px;border-top:1px solid #e2e8f0;padding-top:6px}
  @media print{body{padding:8px}@page{margin:8mm;size:A4}}
</style></head><body>

  ${ncBanner}

  <!-- CABEÇALHO -->
  <div class="hdr">
    <div>
      <div class="company-name">${settings.name}</div>
      <div style="font-size:9px;color:#475569;margin-top:4px;line-height:1.6">
        ${settings.address ? settings.address + '<br>' : ''}
        ${settings.phone ? 'Telef. ' + settings.phone + '<br>' : ''}
        ${settings.email ? settings.email + '<br>' : ''}
        ${settings.cons_reg_com ? 'Cons. Reg. Com. ' + settings.cons_reg_com + '<br>' : ''}
        ${settings.capital_social ? 'Capital Social ' + settings.capital_social + '<br>' : ''}
        <strong>Contribuinte N.º: ${settings.nif}</strong>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:900;color:#0f172a;letter-spacing:1px">${settings.name.split(' ').map((w: string) => w[0]).join('').toUpperCase()}</div>
      <div style="font-size:10px;font-weight:700;color:#334155;margin-top:2px">PRIMAVERA BSS</div>
      ${settings.nif ? `<div style="font-size:9px;color:#64748b">NIF: ${settings.nif}${settings.phone ? ' · TEL: ' + settings.phone : ''}</div>` : ''}
    </div>
  </div>

  <!-- DESTINATÁRIO + REF DOCUMENTO -->
  <div style="display:flex;justify-content:space-between;margin-bottom:10px">
    <div style="font-size:10px;line-height:1.7">
      <span style="color:#475569">Exmo.(s) Sr.(s)</span><br>
      <strong style="font-size:12px">${order.customer_name || 'Consumidor Final'}</strong><br>
      ${order.customer_nif ? `<span style="color:#475569">NIF:</span> ${order.customer_nif}` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:900;margin-bottom:2px">${fullDocRef}</div>
      <div style="font-size:10px;color:#64748b">${isNC ? 'Nota de Crédito' : 'Original'}</div>
      <div style="font-size:9px;color:#94a3b8;margin-top:2px">Importado via PRIMAVERA</div>
    </div>
  </div>

  <!-- META TABLE -->
  <table class="meta-table">
    <tr>
      <th>V/N.º Contrib.</th>
      <th>Série/Número</th>
      <th>Moeda</th>
      <th>Data</th>
      <th>Hora</th>
    </tr>
    <tr>
      <td>${order.customer_nif || ''}</td>
      <td>${docRef}</td>
      <td>AKZ</td>
      <td>${dataISO}</td>
      <td>${timeStr}</td>
    </tr>
    <tr>
      <th>Tipo Documento</th>
      <th colspan="2">Cliente</th>
      <th colspan="2">Condição Pagamento</th>
    </tr>
    <tr>
      <td>${docLabel}</td>
      <td colspan="2">${order.customer_name || 'Consumidor Final'}</td>
      <td colspan="2">Pronto Pagamento</td>
    </tr>
  </table>

  <!-- ARTIGOS -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:45px">Artigo</th>
        <th>Descrição</th>
        <th style="width:55px">Qtd.</th>
        <th style="width:35px">Un.</th>
        <th style="width:95px;text-align:right">Pr. Unitário</th>
        <th style="width:50px">Desc.</th>
        <th style="width:65px">IVA</th>
        <th style="width:95px;text-align:right">Valor</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- LINHA DE CERTIFICAÇÃO AGT -->
  <p style="font-size:8px;color:#64748b;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:4px 6px;margin:0">
    Processado por PRIMAVERA BSS &nbsp;|&nbsp; Os bens foram colocados à disposição na data ${dataISO} &nbsp;|&nbsp; Peixaria Khrismir v1.5
  </p>

  <!-- RODAPÉ COM TOTAIS E IVA -->
  <div style="display:flex;gap:16px;margin-top:8px;font-size:10px">

    <!-- Esquerda: IVA table + banco -->
    <div style="flex:0 0 320px">
      ${isExempt ? `<p style="font-size:9px;font-style:italic;margin-bottom:4px;color:#475569">Transmissão de bens e serviço não sujeita</p>` : ''}
      <p style="font-size:9px;font-weight:700;margin-bottom:4px;color:#475569">Quadro Resumo de Impostos</p>
      <table class="iva-table">
        <tr>
          <th>Taxa/Valor</th>
          <th>Incid./Qtd.</th>
          <th>Total</th>
          <th>Motivo Isenção</th>
        </tr>
        <tr>
          <td>${ivaLabel}</td>
          <td style="text-align:center">${isExempt ? '(90)' : ''}&nbsp;${fmt2(totalNet)}</td>
          <td style="text-align:right;font-weight:700">${fmt2(totalVat)}</td>
          <td style="font-size:8px;color:#475569">${ivaMotivo}</td>
        </tr>
      </table>
      ${bankSection}
    </div>

    <!-- Direita: totais -->
    <div style="flex:1">
      <div class="totals-row"><span>Mercadoria/Serviços</span><span>${fmt2(totalNet)}</span></div>
      <div class="totals-row"><span>Descontos Comerciais</span><span>0,00</span></div>
      <div class="totals-row"><span>Desconto Financeiro</span><span>0,00</span></div>
      <div class="totals-row"><span>Portes</span><span>0,00</span></div>
      <div class="totals-row"><span>${ivaLabel}</span><span>${fmt2(totalVat)}</span></div>
      <div class="totals-row sep" style="border-top:2px solid #1e293b;padding-top:6px;margin-top:4px">
        <span style="font-size:15px;font-weight:900">${isNC ? 'TOTAL CRÉDITO ( AKZ )' : 'Total ( AKZ )'}</span>
        <span style="font-size:15px;font-weight:900">${fmt2(totalAbs)}</span>
      </div>
    </div>
  </div>

  <!-- EXTENSO -->
  <p style="font-size:10px;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px">
    ${isNC
      ? `Nota de crédito no valor de<br><strong>${amountInWords(totalAbs)}.</strong>`
      : `Recebemos relativamente ao pagamento do documento ${fullDocRef}, a quantia de<br><strong>${amountInWords(totalAbs)}.</strong>`
    }
  </p>

  <!-- RODAPÉ FISCAL -->
  <div class="footer-line">
    Documento originado em PRIMAVERA BSS &nbsp;|&nbsp; Referência: ${order.order_number} &nbsp;|&nbsp; NIF: ${settings.nif}
  </div>
</body></html>`

  open(html, fullDocRef)
}

function open(html: string, title: string) {
  const win = window.open('', '_blank', 'width=960,height=750')
  if (!win) return
  win.document.title = title
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}
