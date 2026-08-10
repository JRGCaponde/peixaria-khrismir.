/**
 * agt.ts — Ligação à Faturação Eletrónica da AGT (Administração Geral Tributária, Angola)
 *
 * A AGT exige registo prévio em quiosqueagt.minfin.gov.ao para obter chaves
 * pública/privada e certificação do software antes de qualquer submissão real
 * ter validade fiscal. Este módulo fica pronto a ligar assim que essas
 * credenciais existirem — sem credenciais configuradas, nunca tenta rede e
 * devolve sempre 'sem_credenciais'.
 */

import * as jose from 'jose'
import type { Order } from '../types/database'
import type { StoreSettings } from './settings'

export interface AGTConfig {
  enabled: boolean
  environment: 'sandbox' | 'producao'
  endpointUrl: string
  certificateNumber: string
  privateKeyPem: string   // fica só neste dispositivo — nunca sincronizado
}

export const DEFAULT_AGT_CONFIG: AGTConfig = {
  enabled: false,
  environment: 'sandbox',
  endpointUrl: '',
  certificateNumber: '',
  privateKeyPem: '',
}

const CONFIG_KEY = 'khrismir_agt_config'

export function getAGTConfig(): AGTConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) return { ...DEFAULT_AGT_CONFIG, ...JSON.parse(stored) }
  } catch { /* ignora config corrompida */ }
  return { ...DEFAULT_AGT_CONFIG }
}

export function saveAGTConfig(config: AGTConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function isAGTConfigured(config: AGTConfig = getAGTConfig()): boolean {
  return !!(config.enabled && config.endpointUrl && config.privateKeyPem)
}

// ── Payload da factura ────────────────────────────────────────
// Estrutura provisória — a ajustar quando a AGT publicar o schema definitivo
// da API de Faturação Eletrónica.
export function buildAGTInvoicePayload(order: Order, settings: StoreSettings) {
  return {
    emitente: { nif: settings.nif, nome: settings.name },
    documento: {
      tipo: 'FT',
      numero: order.order_number,
      data: order.created_at.slice(0, 10),
      moeda: 'AOA',
    },
    cliente: {
      nif: order.customer_nif || undefined,
      nome: order.customer_name || 'Consumidor Final',
    },
    linhas: order.items.map(item => ({
      descricao: item.product_name,
      quantidade: item.quantity,
      precoUnitario: item.unit_price,
      total: item.total_price,
      taxaIVA: settings.iva_rate,
    })),
    totais: {
      bruto: order.total,
      liquido: order.total / (1 + settings.iva_rate / 100),
      iva: order.total - order.total / (1 + settings.iva_rate / 100),
    },
  }
}

// ── Assinatura digital JWS ─────────────────────────────────────
export async function signInvoiceJWS(payload: unknown, privateKeyPem: string): Promise<string> {
  const privateKey = await jose.importPKCS8(privateKeyPem, 'RS256')
  const body = new TextEncoder().encode(JSON.stringify(payload))
  return new jose.CompactSign(body)
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKey)
}

// ── Submissão ────────────────────────────────────────────────
export type AGTSubmitResult =
  | { status: 'sem_credenciais' }
  | { status: 'enviado'; submissionId: string }
  | { status: 'erro'; error: string }

export async function submitInvoiceToAGT(order: Order, settings: StoreSettings): Promise<AGTSubmitResult> {
  const config = getAGTConfig()
  if (!isAGTConfigured(config)) return { status: 'sem_credenciais' }

  try {
    const payload = buildAGTInvoicePayload(order, settings)
    const jws = await signInvoiceJWS(payload, config.privateKeyPem)

    const res = await fetch(config.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose' },
      body: jws,
    })
    if (!res.ok) return { status: 'erro', error: `AGT respondeu ${res.status}` }

    const data = await res.json().catch(() => ({}))
    return { status: 'enviado', submissionId: data.submissionId ?? data.id ?? crypto.randomUUID() }
  } catch (err: any) {
    return { status: 'erro', error: err?.message ?? 'Falha de ligação à AGT' }
  }
}

/**
 * Ponto de integração não-bloqueante: chamar depois de criar/imprimir uma factura.
 * Não faz nada se a AGT não estiver configurada — seguro chamar sempre.
 */
export async function maybeQueueForAGT(order: Order, settings: StoreSettings): Promise<AGTSubmitResult> {
  if (!isAGTConfigured()) return { status: 'sem_credenciais' }
  return submitInvoiceToAGT(order, settings)
}

// ── Teste de ligação ────────────────────────────────────────────
export async function testAGTConnection(config: AGTConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.endpointUrl) return { ok: false, message: 'Indique o URL do endpoint da AGT' }
  if (!config.privateKeyPem) return { ok: false, message: 'Indique a chave privada' }
  try {
    await jose.importPKCS8(config.privateKeyPem, 'RS256')
  } catch {
    return { ok: false, message: 'Chave privada inválida — deve estar em formato PEM (PKCS8)' }
  }
  try {
    const res = await fetch(config.endpointUrl, { method: 'HEAD' })
    return { ok: res.ok, message: res.ok ? 'Ligação estabelecida com o endpoint' : `Endpoint respondeu ${res.status}` }
  } catch {
    return { ok: false, message: 'Não foi possível contactar o endpoint (verifique o URL e a ligação à internet)' }
  }
}
