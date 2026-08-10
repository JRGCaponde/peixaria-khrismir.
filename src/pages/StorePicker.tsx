/**
 * StorePicker.tsx — Ecrã de selecção de loja
 * Aparece quando o utilizador tem acesso a mais de uma loja
 * ou quando é super_admin.
 */

import React, { useState, useEffect } from 'react'
import { Store, LogOut, ChevronRight, Search, MapPin, Phone, Plus, X } from 'lucide-react'
import { supabase, isSupabaseReady } from '../lib/supabase'
import { useStore, type StoreInfo } from '../lib/storeContext'
import { useAuthStore } from '../stores/useAuthStore'
import { pullAll, syncStore } from '../lib/sync'
import { startRealtime } from '../lib/realtime'
import { toast } from 'sonner'

const emptyForm = () => ({ name: '', address: '', phone: '', email: '', whatsapp: '', nif: '', iva_rate: '14' })

export default function StorePicker() {
  const { setStore } = useStore()
  const { user, logout } = useAuthStore()
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    loadStores()
  }, [])

  async function loadStores() {
    setLoading(true)
    if (!isSupabaseReady() || !supabase) { setLoading(false); return }

    try {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('active', true)
        .order('name')

      if (error) { toast.error('Erro ao carregar lojas'); return }
      setStores(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function selectStore(store: StoreInfo) {
    setSelecting(store.id)
    try {
      // 1. Guarda loja → App.tsx navega imediatamente para Admin
      setStore(store)
      startRealtime()
      toast.success(`✅ Loja "${store.name}" seleccionada`)
      // 2. Sync em background — Admin tem o seu próprio pullAll() no mount
      pullAll().catch(() => {/* silencioso — Admin sincroniza novamente */})
    } catch (e: any) {
      console.error('[StorePicker] selectStore error:', e)
      toast.error('Erro ao seleccionar loja: ' + (e?.message ?? 'desconhecido'))
    } finally {
      setSelecting(null)
    }
  }

  async function createStore() {
    if (!form.name.trim()) { toast.error('Nome da loja é obrigatório'); return }
    setCreating(true)
    try {
      const result = await syncStore({
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        nif: form.nif.trim() || undefined,
        iva_rate: form.iva_rate ? Number(form.iva_rate) : 14,
        active: true,
      })
      if (!result) { toast.error('Erro ao criar loja. Verifique a ligação ao Supabase.'); return }
      toast.success(`Loja "${form.name}" criada com sucesso!`)
      setShowCreate(false)
      setForm(emptyForm())
      await loadStores()
    } finally {
      setCreating(false)
    }
  }

  const filtered = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.address ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Seleccionar Loja</h1>
          <p className="text-gray-500 text-sm mt-1">
            Olá, <span className="font-medium">{user?.full_name || user?.email}</span>. Escolha a loja para continuar.
          </p>
          <button
            onClick={() => { setForm(emptyForm()); setShowCreate(true) }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-xl hover:bg-cyan-700 transition shadow"
          >
            <Plus className="w-4 h-4" /> Nova Loja
          </button>
        </div>

        {/* Search */}
        {stores.length > 4 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar loja..."
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
            />
          </div>
        )}

        {/* Lista de lojas */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">A carregar lojas...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{search ? 'Nenhuma loja encontrada' : 'Sem lojas disponíveis'}</p>
            </div>
          ) : (
            filtered.map((store, idx) => (
              <button
                key={store.id}
                onClick={() => selectStore(store)}
                disabled={!!selecting}
                className={`w-full flex items-center gap-4 p-4 text-left hover:bg-cyan-50 transition group
                  ${idx > 0 ? 'border-t border-gray-100' : ''}
                  ${selecting === store.id ? 'bg-cyan-50' : ''}`}
              >
                {/* Ícone loja */}
                <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-200 transition">
                  <span className="text-xl font-bold text-cyan-600">
                    {store.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 truncate">{store.name}</p>
                  {store.address && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />{store.address}
                    </p>
                  )}
                  {store.phone && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
                      <Phone className="w-3 h-3 flex-shrink-0" />{store.phone}
                    </p>
                  )}
                </div>

                {/* Seta / spinner */}
                <div className="flex-shrink-0">
                  {selecting === store.id ? (
                    <div className="w-5 h-5 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-cyan-600 transition" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Botão sair */}
        <button
          onClick={() => logout()}
          className="w-full mt-4 flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-red-500 transition py-2"
        >
          <LogOut className="w-4 h-4" /> Terminar sessão
        </button>
      </div>

      {/* Modal — Criar Loja */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-800">Nova Loja</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <Field label="Nome da loja *">
                <input className={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Peixaria Khrismir" autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="NIF">
                  <input className={inp} value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} placeholder="500XXXXXXX" />
                </Field>
                <Field label="IVA (%)">
                  <input className={inp} type="number" min="0" max="100" value={form.iva_rate} onChange={e => setForm({ ...form, iva_rate: e.target.value })} />
                </Field>
              </div>
              <Field label="Morada">
                <input className={inp} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, cidade, provincia" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefone">
                  <input className={inp} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+244 9XX XXX XXX" />
                </Field>
                <Field label="WhatsApp">
                  <input className={inp} type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+244 9XX XXX XXX" />
                </Field>
              </div>
              <Field label="Email">
                <input className={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="loja@exemplo.ao" />
              </Field>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button
                  onClick={createStore}
                  disabled={creating}
                  className="flex-1 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A criar...</> : <><Plus className="w-4 h-4" /> Criar Loja</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
