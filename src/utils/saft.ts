/**
 * SAF-T/AO 1.01.01 — Standard Audit File for Tax Purposes (Angola)
 * Decreto Presidencial n.º 312/18 e n.º 71/25
 * Schema: SAF-T-AO1.01_01.xsd
 */

import CryptoJS from 'crypto-js'
import type { Order } from '../types/database'
import type { StoreSettings } from '../lib/settings'

// ── Hash de Autenticação ───────────────────────────────────────
// Algoritmo: SHA-256 da string "data;systemEntryDate;invoiceNo;grossTotal;hashAnterior"
// Extrair caracteres nas posições 0, 10, 20, 30 do hash hexadecimal

export function calcInvoiceHash(
  invoiceDate: string,      // YYYY-MM-DD
  systemEntryDate: string,  // YYYY-MM-DDThh:mm:ss
  invoiceNo: string,
  grossTotal: number,
  prevHash: string          // '0' para a primeira factura
): string {
  const str = `${invoiceDate};${systemEntryDate};${invoiceNo};${grossTotal.toFixed(2)};${prevHash}`
  const hex = CryptoJS.SHA256(str).toString()
  return hex[0] + hex[10] + hex[20] + hex[30]
}

// ── Obter hash anterior da última factura guardada ─────────────
export function getLastInvoiceHash(): string {
  try {
    const orders: Order[] = JSON.parse(localStorage.getItem('khrismir_orders') || '[]')
    const sorted = [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const last = sorted.reverse().find(o => o.hash)
    return last?.hash ?? '0'
  } catch { return '0' }
}

// ── Calcular hash para uma nova encomenda ─────────────────────
export function calcOrderHash(order: Omit<Order, 'hash'>): string {
  const prevHash = getLastInvoiceHash()
  const invoiceDate = order.created_at.slice(0, 10)
  const systemEntryDate = order.created_at.slice(0, 19).replace(' ', 'T')
  return calcInvoiceHash(invoiceDate, systemEntryDate, order.order_number, order.total, prevHash)
}

// ── Gerar SAF-T/AO XML ────────────────────────────────────────
export function generateSAFTXML(
  orders: Order[],
  settings: StoreSettings,
  year?: number
): string {
  const ivaRate = (settings.iva_rate ?? 14) / 100
  const targetYear = year ?? new Date().getFullYear()

  const filtered = orders
    .filter(o => new Date(o.created_at).getFullYear() === targetYear)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const totalCredit = filtered.reduce((s, o) => s + o.total, 0)
  const now = new Date()
  const dateCreated = now.toISOString().slice(0, 10)

  // Recalcular hashes em cadeia para garantir integridade
  let prevHash = '0'
  const ordersWithHash = filtered.map(o => {
    const invoiceDate = o.created_at.slice(0, 10)
    const systemEntry = o.created_at.slice(0, 19).replace(' ', 'T')
    const hash = o.hash || calcInvoiceHash(invoiceDate, systemEntry, o.order_number, o.total, prevHash)
    prevHash = hash
    return { ...o, hash }
  })

  const esc = (s: string | undefined) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const invoiceLines = ordersWithHash.map(o => {
    const invoiceDate = o.created_at.slice(0, 10)
    const systemEntry = o.created_at.slice(0, 19).replace(' ', 'T')
    const grossTotal = o.total.toFixed(2)
    const netTotal   = (o.total / (1 + ivaRate)).toFixed(2)
    const taxPayable = (o.total * ivaRate / (1 + ivaRate)).toFixed(2)
    const period     = String(new Date(o.created_at).getMonth() + 1)
    const custId     = o.customer_nif ? esc(o.customer_nif) : (o.customer_id ? esc(o.customer_id) : 'CONSUMIDOR_FINAL')
    const status     = o.status === 'cancelado' ? 'A' : 'N'

    const lines = o.items.map((item, idx) => `
      <Line>
        <LineNumber>${idx + 1}</LineNumber>
        <ProductCode>${esc(item.product_id)}</ProductCode>
        <ProductDescription>${esc(item.product_name)} (${esc(item.preparation)})</ProductDescription>
        <Quantity>${Number(item.quantity).toFixed(3)}</Quantity>
        <UnitOfMeasure>KG</UnitOfMeasure>
        <UnitPrice>${Number(item.unit_price).toFixed(2)}</UnitPrice>
        <TaxPointDate>${invoiceDate}</TaxPointDate>
        <Description>${esc(item.product_name)}</Description>
        <CreditAmount>${Number(item.total_price).toFixed(2)}</CreditAmount>
        <Tax>
          <TaxType>IVA</TaxType>
          <TaxCountryRegion>AO</TaxCountryRegion>
          <TaxCode>NOR</TaxCode>
          <TaxPercentage>${settings.iva_rate ?? 14}</TaxPercentage>
        </Tax>
      </Line>`).join('')

    return `
    <Invoice>
      <InvoiceNo>${esc(o.order_number)}</InvoiceNo>
      <ATCUD>0</ATCUD>
      <DocumentStatus>
        <InvoiceStatus>${status}</InvoiceStatus>
        <InvoiceStatusDate>${systemEntry}</InvoiceStatusDate>
        <SourceID>SISTEMA</SourceID>
        <SourcePayment>P</SourcePayment>
      </DocumentStatus>
      <Hash>${esc(o.hash ?? '0000')}</Hash>
      <HashControl>1</HashControl>
      <Period>${period}</Period>
      <InvoiceDate>${invoiceDate}</InvoiceDate>
      <InvoiceType>FT</InvoiceType>
      <SpecialRegimes>
        <SelfBillingIndicator>0</SelfBillingIndicator>
        <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
        <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
      </SpecialRegimes>
      <SourceID>SISTEMA</SourceID>
      <EACCode>5200</EACCode>
      <SystemEntryDate>${systemEntry}</SystemEntryDate>
      <CustomerID>${custId}</CustomerID>
      <ShipTo>
        <DeliveryID>${esc(o.delivery_type)}</DeliveryID>
        <Address>
          <AddressDetail>${esc(o.delivery_address || settings.address || 'N/A')}</AddressDetail>
          <City>${esc(settings.address?.split(',').pop()?.trim() || 'N/A')}</City>
          <Country>AO</Country>
        </Address>
      </ShipTo>
      ${lines}
      <DocumentTotals>
        <TaxPayable>${taxPayable}</TaxPayable>
        <NetTotal>${netTotal}</NetTotal>
        <GrossTotal>${grossTotal}</GrossTotal>
        <Currency>
          <CurrencyCode>AOA</CurrencyCode>
          <CurrencyAmount>${grossTotal}</CurrencyAmount>
          <ExchangeRate>1.00</ExchangeRate>
        </Currency>
      </DocumentTotals>
      <WithholdingTax>
        <WithholdingTaxType>IRS</WithholdingTaxType>
        <WithholdingTaxAmount>0.00</WithholdingTaxAmount>
      </WithholdingTax>
    </Invoice>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="urn:OECD:StandardAuditFile-Tax:AO_1.01_01 SAF-T-AO1.01_01.xsd">
  <Header>
    <AuditFileVersion>AO_1.01_01</AuditFileVersion>
    <CompanyID>${esc(settings.nif)}</CompanyID>
    <TaxRegistrationNumber>${esc(settings.nif)}</TaxRegistrationNumber>
    <TaxAccountingBasis>F</TaxAccountingBasis>
    <CompanyName>${esc(settings.name)}</CompanyName>
    <BusinessName>${esc(settings.name)}</BusinessName>
    <CompanyAddress>
      <AddressDetail>${esc(settings.address)}</AddressDetail>
      <City>${esc(settings.address?.split(',').pop()?.trim() || '')}</City>
      <PostalCode>0000-000</PostalCode>
      <Country>AO</Country>
    </CompanyAddress>
    <FiscalYear>${targetYear}</FiscalYear>
    <StartDate>${targetYear}-01-01</StartDate>
    <EndDate>${targetYear}-12-31</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
    <DateCreated>${dateCreated}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${esc(settings.nif)}</ProductCompanyTaxID>
    <SoftwareCertificateNumber>0</SoftwareCertificateNumber>
    <ProductID>Peixaria Khrismir/1.5.0</ProductID>
    <ProductVersion>1.5.0</ProductVersion>
    <HeaderComment>Gerado por Peixaria Khrismir v1.5</HeaderComment>
    <Telephone>${esc(settings.phone)}</Telephone>
    <Email>${esc(settings.email)}</Email>
  </Header>

  <MasterFiles>
    <TaxTable>
      <TaxTableEntry>
        <TaxType>IVA</TaxType>
        <TaxCountryRegion>AO</TaxCountryRegion>
        <TaxCode>NOR</TaxCode>
        <Description>IVA ${settings.iva_rate ?? 14}% — Taxa Normal</Description>
        <TaxPercentage>${settings.iva_rate ?? 14}</TaxPercentage>
      </TaxTableEntry>
    </TaxTable>
  </MasterFiles>

  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${filtered.length}</NumberOfEntries>
      <TotalDebit>0.00</TotalDebit>
      <TotalCredit>${totalCredit.toFixed(2)}</TotalCredit>
      ${invoiceLines}
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>`
}

// ── Download do ficheiro SAF-T XML ────────────────────────────
export function downloadSAFT(xml: string, nif: string, year: number) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `SAF-T_AO_${nif}_${year}.xml`
  a.click()
  URL.revokeObjectURL(url)
}
