// Escape de HTML para os documentos que se abrem com document.write (facturas,
// talões, relatórios). Nomes de clientes/produtos e dados da loja vêm de
// formulários e da nuvem — sem escape, um nome como "<img src=x onerror=...>"
// corria código na janela de impressão.

const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/[&<>"']/g, c => MAP[c])
}

/**
 * Cópia com todas as strings escapadas (objectos e arrays, em profundidade).
 * Números, booleanos, null e undefined ficam iguais — por isso os cálculos e
 * comparações com valores fixos ('cancelado', 'misto'...) continuam a funcionar.
 * Usar UMA vez, à entrada da função que gera o HTML, para não escapar duas vezes.
 */
export function escapeDeep<T>(v: T): T {
  if (typeof v === 'string') return escapeHtml(v) as unknown as T
  if (Array.isArray(v)) return v.map(escapeDeep) as unknown as T
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = escapeDeep(val)
    return out as T
  }
  return v
}
