import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Upload, Package, Users, Truck, FileText, Check, ChevronRight, X, AlertTriangle } from 'lucide-react'
import { syncProducts, syncSuppliers, pullAll } from '../lib/sync'
import { supabase, isSupabaseReady } from '../lib/supabase'
import type { Product, Category } from '../types/database'
import { useStore } from '../lib/storeContext'

// ── Tipos do ficheiro de importação ────────────────────────────────────────────
interface PrimProduto {
  code: string; name: string; unit: string
  cost_price: number; last_cost: number; vat_code: string
  stock: number; family: string; sub_family: string
}
interface PrimCliente {
  code: string; name: string; address: string
  city: string; postal_code: string; phone: string; nif: string
}
interface PrimFornecedor {
  code: string; name: string; address: string
  city: string; postal_code: string; phone: string; nif: string
}
interface PrimFactura {
  date: string; type: string; number: string
  client_code: string; client_name: string; client_nif: string
  subtotal: number; iva: number; total: number
  doc_ref: string; exchange_rate: number
}
interface ImportFile {
  source: string; exported_at: string
  next_invoice_number: number; invoice_year: number
  stats: { produtos: number; clientes: number; fornecedores: number; facturas: number }
  produtos: PrimProduto[]; clientes: PrimCliente[]
  fornecedores: PrimFornecedor[]; facturas: PrimFactura[]
}

// ── Componente principal ────────────────────────────────────────────────────────
export default function ImportPrimaveraTab({ categories }: { categories: Category[] }) {
  const { store } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<ImportFile | null>(null)
  const [loading, setLoading] = useState(false)

  // mapeamento família → categoria do app
  const [familyMap, setFamilyMap] = useState<Record<string, string>>({})
  // multiplicador de preço (custo × X)
  const [priceMultiplier, setPriceMultiplier] = useState(1.15)
  // preços manuais por produto
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({})
  // selecção de produtos a importar
  const [selectedProds, setSelectedProds] = useState<Set<string>>(new Set())
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [selectedForn, setSelectedForn] = useState<Set<string>>(new Set())

  // resultado das importações
  const [done, setDone] = useState<{ products?: number; clients?: number; suppliers?: number; counter?: boolean }>({})

  // Carrega o ficheiro JSON
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        // Normaliza: PowerShell pode serializar arrays como { value: [...] }
        const toArr = (v: any): any[] => {
          if (Array.isArray(v)) return v
          if (v && Array.isArray(v.value)) return v.value
          if (v && typeof v === 'object') return Object.values(v)
          return []
        }
        const parsed: ImportFile = {
          ...raw,
          produtos:     toArr(raw.produtos),
          clientes:     toArr(raw.clientes),
          fornecedores: toArr(raw.fornecedores),
          facturas:     toArr(raw.facturas),
        }
        if (!parsed.produtos.length && !parsed.clientes.length) throw new Error('Ficheiro sem dados')
        setData(parsed)
        setSelectedProds(new Set(parsed.produtos.map((p: any) => p.code)))
        setSelectedClients(new Set(parsed.clientes.map((c: any) => c.code)))
        setSelectedForn(new Set(parsed.fornecedores.map((f: any) => f.code)))
        toast.success(`Ficheiro carregado: ${parsed.produtos.length} produtos, ${parsed.clientes.length} clientes`)
      } catch (err: any) {
        toast.error('Ficheiro inválido: ' + (err?.message ?? 'verifique o ficheiro'))
      }
    }
    reader.readAsText(file)
  }

  // ── Importar produtos ─────────────────────────────────────────────────────────
  async function importProducts() {
    if (!data) return
    setLoading(true)
    const sid = store?.id
    const prods: Product[] = data.produtos
      .filter(p => selectedProds.has(p.code))
      .map(p => {
        const cost = p.cost_price > 0 ? p.cost_price : (p.last_cost > 0 ? p.last_cost : 0)
        const price = manualPrices[p.code] ?? Math.round(cost * priceMultiplier)
        const catId = familyMap[p.family] ?? (categories[0]?.id ?? '')
        return {
          id: crypto.randomUUID(),
          name: p.name || p.code,
          price,
          cost_price: cost,
          unit: p.unit || 'KG',
          stock_quantity: Math.max(0, p.stock),
          min_stock: 0,
          allow_whole: true,
          allow_clean: true,
          allow_fillet: true,
          allow_steak: true,
          category_id: catId,
          store_id: sid,
        } as unknown as Product
      })
    try {
      const result = await syncProducts(prods)
      if (!result.ok) {
        toast.error(`Erro ao importar produtos: ${result.error ?? 'erro desconhecido'}`)
        return
      }
      await pullAll()
      setDone(d => ({ ...d, products: prods.length }))
      toast.success(`${prods.length} produtos importados!`)
    } catch (err: any) {
      toast.error('Erro ao importar produtos: ' + (err?.message ?? 'verifique a ligação'))
    } finally {
      setLoading(false)
    }
  }

  // ── Importar clientes ─────────────────────────────────────────────────────────
  async function importClients() {
    if (!data || !isSupabaseReady() || !supabase) return
    setLoading(true)
    const sid = store?.id

    // Busca nomes já existentes na tabela clients para evitar duplicados
    const { data: existing } = await supabase
      .from('clients')
      .select('company_name, tax_id')
      .eq('store_id', sid)
    const existingNames = new Set((existing ?? []).map((r: any) => r.company_name).filter(Boolean))
    const existingNifs  = new Set((existing ?? []).map((r: any) => r.tax_id).filter(Boolean))

    const rows = data.clientes
      .filter(c => selectedClients.has(c.code) && c.name)
      .filter(c => !existingNames.has(c.name) && (!c.nif || !existingNifs.has(c.nif)))
      .map(c => ({
        store_id:       sid,
        full_name:      c.name,
        company_name:   c.name,
        tax_id:         c.nif || null,
        phone:          c.phone || null,
        address:        [c.address, c.city].filter(Boolean).join(', ') || null,
        primavera_code: c.code,
      }))

    if (rows.length === 0) {
      toast.info('Todos os clientes já existem.')
      setLoading(false)
      setDone(d => ({ ...d, clients: 0 }))
      return
    }

    const { error } = await supabase.from('clients').insert(rows)
    if (error) { toast.error('Erro ao importar clientes: ' + error.message); setLoading(false); return }
    // Sem isto, os clientes ficavam só na cloud e não apareciam no app
    // até à próxima sincronização (que só acontece noutro ponto do app).
    await pullAll()
    setDone(d => ({ ...d, clients: rows.length }))
    toast.success(`${rows.length} clientes importados!`)
    setLoading(false)
  }

  // ── Importar fornecedores ─────────────────────────────────────────────────────
  async function importSuppliers() {
    if (!data) return
    setLoading(true)
    const existing: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_suppliers') || '[]') } catch { return [] } })()
    const existingNames = new Set(existing.map((s: any) => s.name.toLowerCase()))
    const newForn = data.fornecedores
      .filter(f => selectedForn.has(f.code) && !existingNames.has(f.name.toLowerCase()))
      .map(f => ({
        id: crypto.randomUUID(),
        name: f.name,
        phone: f.phone || '',
        address: [f.address, f.city].filter(Boolean).join(', '),
        nif: f.nif || '',
        created_at: new Date().toISOString(),
      }))
    const updated = [...existing, ...newForn]
    localStorage.setItem('khrismir_suppliers', JSON.stringify(updated))
    // Sem isto, os fornecedores importados ficavam só neste dispositivo e
    // desapareciam no próximo pullAll() (que substitui a lista local pela da cloud)
    await syncSuppliers(updated)
    window.dispatchEvent(new CustomEvent('khrismir:sync', { detail: { table: 'suppliers' } }))
    setDone(d => ({ ...d, suppliers: newForn.length }))
    toast.success(`${newForn.length} fornecedores importados!`)
    setLoading(false)
  }

  // ── Guardar contador de facturas ──────────────────────────────────────────────
  function saveInvoiceCounter() {
    if (!data) return
    const counter = { year: data.invoice_year, next: data.next_invoice_number }
    localStorage.setItem('khrismir_invoice_counter', JSON.stringify(counter))
    setDone(d => ({ ...d, counter: true }))
    toast.success(`Contador guardado: FT FA.${data.invoice_year}/${data.next_invoice_number}`)
  }

  // familias únicas nos produtos
  const families = data ? [...new Set(data.produtos.map(p => p.family).filter(Boolean))] : []

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Importar do PRIMAVERA BSS</h2>
          <p className="text-gray-500 text-sm">
            Carregue o ficheiro <code className="bg-gray-100 px-1 rounded">primavera-import.json</code> gerado a partir do SQL Server.
          </p>
          <p className="text-gray-400 text-xs mt-1">O ficheiro está em <code>C:\primavera-export\primavera-import.json</code></p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-blue-300 rounded-2xl p-10 hover:bg-blue-50 transition flex flex-col items-center gap-3"
        >
          <Upload className="w-8 h-8 text-blue-400" />
          <span className="font-semibold text-blue-600">Seleccionar ficheiro JSON</span>
          <span className="text-xs text-gray-400">primavera-import.json</span>
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header do ficheiro */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start justify-between">
        <div>
          <p className="font-bold text-blue-800">{data.source}</p>
          <p className="text-xs text-blue-600">Exportado em {data.exported_at}</p>
          <div className="flex gap-4 mt-2 text-sm text-blue-700">
            <span>{data.stats.produtos} produtos</span>
            <span>{data.stats.clientes} clientes</span>
            <span>{data.stats.fornecedores} fornecedores</span>
            <span>{data.stats.facturas} facturas</span>
          </div>
        </div>
        <button onClick={() => { setData(null); setDone({}) }} className="text-blue-400 hover:text-blue-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Contador de facturas ──────────────────────────────────────────────── */}
      <Section icon={<FileText className="w-5 h-5" />} title="Numeração de Facturas" done={done.counter}>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Última factura no PRIMAVERA</p>
            <p className="text-lg font-bold text-gray-800">FT FA.{data.invoice_year}/{data.next_invoice_number - 1}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
          <div className="flex-1 bg-green-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Próxima factura no app</p>
            <p className="text-lg font-bold text-green-700">FT FA.{data.invoice_year}/{data.next_invoice_number}</p>
          </div>
        </div>
        <button
          onClick={saveInvoiceCounter}
          disabled={!!done.counter}
          className="mt-3 w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {done.counter ? <><Check className="w-4 h-4" /> Guardado</> : 'Guardar Contador'}
        </button>
      </Section>

      {/* ── Produtos ─────────────────────────────────────────────────────────── */}
      <Section icon={<Package className="w-5 h-5" />} title={`Produtos (${selectedProds.size}/${data.produtos.length})`} done={done.products !== undefined}>
        {/* Config de preço */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">Os preços de venda são calculados como: <strong>custo × multiplicador</strong>. Pode ajustar individualmente depois.</p>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-600">Multiplicador de preço:</label>
          <input
            type="number" step="0.05" min="1" max="5"
            value={priceMultiplier}
            onChange={e => setPriceMultiplier(Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
          <span className="text-xs text-gray-400">(ex: 1.15 = custo + 15%)</span>
        </div>

        {/* Mapeamento de famílias */}
        {families.length > 0 && categories.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mapear Famílias → Categorias</p>
            <div className="grid grid-cols-2 gap-2">
              {families.map(fam => (
                <div key={fam} className="flex items-center gap-2">
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded font-mono w-16 text-center">{fam}</span>
                  <select
                    value={familyMap[fam] ?? ''}
                    onChange={e => setFamilyMap(m => ({ ...m, [fam]: e.target.value }))}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                  >
                    <option value="">— seleccionar —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de produtos */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
            <input type="checkbox" checked={selectedProds.size === data.produtos.length}
              onChange={e => setSelectedProds(e.target.checked ? new Set(data.produtos.map(p => p.code)) : new Set())}
              className="rounded" />
            <span className="w-16">Código</span>
            <span className="flex-1">Nome</span>
            <span className="w-20 text-right">Custo</span>
            <span className="w-20 text-right">Venda</span>
            <span className="w-16 text-right">Stock</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
            {data.produtos.map(p => {
              const cost = p.cost_price > 0 ? p.cost_price : p.last_cost
              const price = manualPrices[p.code] ?? Math.round(cost * priceMultiplier)
              return (
                <div key={p.code} className={`flex items-center gap-2 px-3 py-2 text-sm ${!selectedProds.has(p.code) ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={selectedProds.has(p.code)}
                    onChange={e => setSelectedProds(s => { const n = new Set(s); e.target.checked ? n.add(p.code) : n.delete(p.code); return n })}
                    className="rounded" />
                  <span className="w-16 font-mono text-xs text-gray-400">{p.code}</span>
                  <span className="flex-1 font-medium truncate">{p.name}</span>
                  <span className="w-20 text-right text-gray-500 text-xs">{cost.toLocaleString('pt-AO')} AKZ</span>
                  <input
                    type="number" min="0"
                    value={price}
                    onChange={e => setManualPrices(m => ({ ...m, [p.code]: Number(e.target.value) }))}
                    className="w-20 text-right text-xs border border-gray-200 rounded px-1 py-0.5"
                  />
                  <span className="w-16 text-right text-xs text-gray-400">{p.stock.toFixed(1)} kg</span>
                </div>
              )
            })}
          </div>
        </div>
        <button
          onClick={importProducts} disabled={loading || selectedProds.size === 0}
          className="mt-3 w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {done.products !== undefined
            ? <><Check className="w-4 h-4" /> {done.products} produtos importados</>
            : loading ? 'A importar...' : `Importar ${selectedProds.size} Produtos`}
        </button>
      </Section>

      {/* ── Clientes ─────────────────────────────────────────────────────────── */}
      <Section icon={<Users className="w-5 h-5" />} title={`Clientes (${selectedClients.size}/${data.clientes.length})`} done={done.clients !== undefined}>
        <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
            <input type="checkbox" checked={selectedClients.size === data.clientes.length}
              onChange={e => setSelectedClients(e.target.checked ? new Set(data.clientes.map(c => c.code)) : new Set())}
              className="rounded" />
            <span className="flex-1">Nome</span>
            <span className="w-36">NIF</span>
            <span className="w-32">Telefone</span>
          </div>
          <div className="divide-y divide-gray-50">
            {data.clientes.map(c => (
              <div key={c.code} className={`flex items-center gap-2 px-3 py-2 text-sm ${!selectedClients.has(c.code) ? 'opacity-40' : ''}`}>
                <input type="checkbox" checked={selectedClients.has(c.code)}
                  onChange={e => setSelectedClients(s => { const n = new Set(s); e.target.checked ? n.add(c.code) : n.delete(c.code); return n })}
                  className="rounded" />
                <span className="flex-1 font-medium truncate">{c.name}</span>
                <span className="w-36 font-mono text-xs text-gray-500">{c.nif || '—'}</span>
                <span className="w-32 text-xs text-gray-500">{c.phone || '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={importClients} disabled={loading || selectedClients.size === 0}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {done.clients !== undefined
            ? <><Check className="w-4 h-4" /> {done.clients} clientes importados</>
            : loading ? 'A importar...' : `Importar ${selectedClients.size} Clientes`}
        </button>
      </Section>

      {/* ── Fornecedores ─────────────────────────────────────────────────────── */}
      <Section icon={<Truck className="w-5 h-5" />} title={`Fornecedores (${selectedForn.size}/${data.fornecedores.length})`} done={done.suppliers !== undefined}>
        <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
            <input type="checkbox" checked={selectedForn.size === data.fornecedores.length}
              onChange={e => setSelectedForn(e.target.checked ? new Set(data.fornecedores.map(f => f.code)) : new Set())}
              className="rounded" />
            <span className="flex-1">Nome</span>
            <span className="w-36">NIF</span>
            <span className="w-32">Telefone</span>
          </div>
          <div className="divide-y divide-gray-50">
            {data.fornecedores.map(f => (
              <div key={f.code} className={`flex items-center gap-2 px-3 py-2 text-sm ${!selectedForn.has(f.code) ? 'opacity-40' : ''}`}>
                <input type="checkbox" checked={selectedForn.has(f.code)}
                  onChange={e => setSelectedForn(s => { const n = new Set(s); e.target.checked ? n.add(f.code) : n.delete(f.code); return n })}
                  className="rounded" />
                <span className="flex-1 font-medium">{f.name}</span>
                <span className="w-36 font-mono text-xs text-gray-500">{f.nif || '—'}</span>
                <span className="w-32 text-xs text-gray-500">{f.phone || '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={importSuppliers} disabled={loading || selectedForn.size === 0}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {done.suppliers !== undefined
            ? <><Check className="w-4 h-4" /> {done.suppliers} fornecedores importados</>
            : `Importar ${selectedForn.size} Fornecedores`}
        </button>
      </Section>

      {/* ── Resumo ────────────────────────────────────────────────────────────── */}
      {Object.keys(done).length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <p className="font-bold text-green-800 mb-2">Importação concluída</p>
          <ul className="text-sm text-green-700 space-y-1">
            {done.counter && <li>✅ Contador: FT FA.{data.invoice_year}/{data.next_invoice_number}</li>}
            {done.products !== undefined && <li>✅ {done.products} produtos adicionados ao catálogo</li>}
            {done.clients !== undefined && <li>✅ {done.clients} clientes criados</li>}
            {done.suppliers !== undefined && <li>✅ {done.suppliers} fornecedores adicionados</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Componente auxiliar Section ────────────────────────────────────────────────
function Section({ icon, title, children, done }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; done?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`border rounded-2xl overflow-hidden ${done ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${done ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
          {done ? <Check className="w-4 h-4" /> : icon}
        </div>
        <span className="font-bold text-gray-800 flex-1">{title}</span>
        {done && <span className="text-xs text-green-600 font-semibold">Concluído</span>}
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
