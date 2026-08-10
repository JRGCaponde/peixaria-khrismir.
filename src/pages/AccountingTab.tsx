import { useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen, ListChecks, Scale, TrendingUp, FileBarChart2,
  Plus, AlertTriangle, Trash2, X, RefreshCw,
} from 'lucide-react'
import type { AccountingAccount, JournalLine } from '../types/database'
import {
  getAccounts, saveAccounts, getJournalEntries, postManualEntry,
  getTrialBalance, getIncomeStatement, getBalanceSheet,
} from '../lib/accounting'
import { reconcileCancelledSales, reconcileMovements } from '../lib/cashflow'
import { useAuthStore } from '../stores/useAuthStore'

const fmt = (n: number) => (n ?? 0).toLocaleString('pt-AO', { maximumFractionDigits: 2 }) + ' Kz'

type SubTab = 'plano' | 'diario' | 'balancete' | 'dre' | 'balanco'

const CLASS_LABELS: Record<number, string> = {
  0: 'Contas de Ordem', 1: 'Meios Monetários', 2: 'Existências', 3: 'Terceiros',
  4: 'Imobilizações', 5: 'Capital e Reservas', 6: 'Custos e Perdas',
  7: 'Proveitos e Ganhos', 8: 'Resultados',
}

export default function AccountingTab() {
  const [sub, setSub] = useState<SubTab>('diario')
  const [reconciling, setReconciling] = useState(false)

  const subTabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: 'diario',    label: 'Diário',                   icon: BookOpen },
    { id: 'plano',     label: 'Plano de Contas',           icon: ListChecks },
    { id: 'balancete', label: 'Balancete',                 icon: Scale },
    { id: 'dre',       label: 'Demonstração de Resultados', icon: TrendingUp },
    { id: 'balanco',   label: 'Balanço',                    icon: FileBarChart2 },
  ]

  const runReconcile = () => {
    setReconciling(true)
    const nCancelled = reconcileCancelledSales()
    const nMovements = reconcileMovements()
    const n = nCancelled + nMovements
    setReconciling(false)
    if (n === 0) {
      toast.success('Tudo certo — a Contabilidade já reflecte tudo o que está no Caixa.')
    } else {
      toast.success(`${n} registo${n > 1 ? 's' : ''} corrigido${n > 1 ? 's' : ''} (${nCancelled} encomenda${nCancelled !== 1 ? 's' : ''} cancelada${nCancelled !== 1 ? 's' : ''}, ${nMovements} movimento${nMovements !== 1 ? 's' : ''} de caixa) — a recarregar…`)
      setTimeout(() => window.location.reload(), 1200)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          A estrutura de classes segue o Plano Geral de Contabilidade de Angola (PGC-AO). As sub-contas semeadas por
          defeito são um esqueleto — <strong>confirme e ajuste com o seu contabilista</strong> antes de reportar oficialmente.
        </p>
      </div>

      <div className="flex justify-end">
        <button onClick={runReconcile} disabled={reconciling}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-gray-50 transition disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
          Reconciliar Caixa com Contabilidade
        </button>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-0">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition -mb-px ${
              sub === t.id ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {sub === 'plano'     && <PlanoContasTab />}
      {sub === 'diario'    && <DiarioTab />}
      {sub === 'balancete' && <BalanceteTab />}
      {sub === 'dre'       && <DRETab />}
      {sub === 'balanco'   && <BalancoTab />}
    </div>
  )
}

/* ─── PLANO DE CONTAS ─── */
function PlanoContasTab() {
  const [accounts, setAccounts] = useState<AccountingAccount[]>(getAccounts)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', class: 1, nature: 'devedora' as 'devedora' | 'credora' })

  const grouped = Array.from({ length: 9 }, (_, c) => c)
    .map(c => ({ classNum: c, accounts: accounts.filter(a => a.class === c).sort((a, b) => a.code.localeCompare(b.code)) }))
    .filter(g => g.accounts.length > 0)

  const addAccount = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.code.trim() || !form.name.trim()) { toast.error('Preencha código e nome'); return }
    if (accounts.some(a => a.code === form.code.trim())) { toast.error('Já existe uma conta com este código'); return }
    const updated = [...accounts, {
      id: crypto.randomUUID(), code: form.code.trim(), name: form.name.trim(),
      class: form.class, nature: form.nature, editable: true, created_at: new Date().toISOString(),
    }]
    setAccounts(updated)
    saveAccounts(updated)
    setForm({ code: '', name: '', class: 1, nature: 'devedora' })
    setModal(false)
    toast.success('Conta criada!')
  }

  const removeAccount = (id: string) => {
    const acc = accounts.find(a => a.id === id)
    if (!acc?.editable) { toast.error('Contas base do plano não podem ser removidas'); return }
    if (!confirm(`Remover a conta ${acc.code} — ${acc.name}?`)) return
    const updated = accounts.filter(a => a.id !== id)
    setAccounts(updated)
    saveAccounts(updated)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      <div className="space-y-6">
        {grouped.map(g => (
          <div key={g.classNum} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b font-bold text-gray-700 text-sm">
              Classe {g.classNum} — {CLASS_LABELS[g.classNum]}
            </div>
            <div className="divide-y">
              {g.accounts.map(a => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-gray-500 w-12">{a.code}</span>
                    <span className="text-gray-800">{a.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.nature === 'devedora' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                      {a.nature === 'devedora' ? 'Devedora' : 'Credora'}
                    </span>
                  </div>
                  {a.editable && (
                    <button onClick={() => removeAccount(a.id)} className="text-gray-300 hover:text-red-500 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={addAccount} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Nova Conta</h3>
              <button type="button" onClick={() => setModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Código</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="ex: 622" className="w-full border p-2.5 rounded-xl text-sm font-mono" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ex: Água, Energia e Combustíveis" className="w-full border p-2.5 rounded-xl text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Classe</label>
                <select value={form.class} onChange={e => setForm(f => ({ ...f, class: Number(e.target.value) }))}
                  className="w-full border p-2.5 rounded-xl text-sm">
                  {Object.entries(CLASS_LABELS).map(([c, label]) => <option key={c} value={c}>{c} — {label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Natureza</label>
                <select value={form.nature} onChange={e => setForm(f => ({ ...f, nature: e.target.value as any }))}
                  className="w-full border p-2.5 rounded-xl text-sm">
                  <option value="devedora">Devedora</option>
                  <option value="credora">Credora</option>
                </select>
              </div>
            </div>
            <button type="submit" className="w-full bg-cyan-600 text-white py-2.5 rounded-xl font-bold hover:bg-cyan-700 transition">
              Criar Conta
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ─── DIÁRIO ─── */
function DiarioTab() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState(getJournalEntries)
  const [accounts] = useState(getAccounts)
  const [modal, setModal] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<JournalLine[]>([{ account_code: '', debit: 0, credit: 0 }, { account_code: '', debit: 0, credit: 0 }])

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balanced = totalDebit === totalCredit && totalDebit > 0

  const updateLine = (i: number, patch: Partial<JournalLine>) => {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  const addLine = () => setLines(ls => [...ls, { account_code: '', debit: 0, credit: 0 }])
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanLines = lines.filter(l => l.account_code && (l.debit > 0 || l.credit > 0))
    const result = postManualEntry(date, description, cleanLines, user?.full_name)
    if (!result.ok) { toast.error(result.error); return }
    setEntries(getJournalEntries())
    setModal(false)
    setDescription('')
    setLines([{ account_code: '', debit: 0, credit: 0 }, { account_code: '', debit: 0, credit: 0 }])
    toast.success('Lançamento registado!')
  }

  const sourceLabel: Record<string, string> = { manual: 'Manual', auto_venda: 'Venda', auto_compra: 'Compra', auto_movimento: 'Movimento de Caixa' }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
          <Plus className="w-4 h-4" /> Lançamento Manual
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {entries.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">Sem lançamentos ainda</p>
        ) : (
          <div className="divide-y">
            {entries.map(e => (
              <div key={e.id} className="px-5 py-3 text-sm">
                <div className="flex justify-between items-start mb-1.5">
                  <div>
                    <span className="font-bold text-gray-800">{e.description}</span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{sourceLabel[e.source] ?? e.source}</span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(e.date).toLocaleDateString('pt-AO')}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-xs text-gray-500 max-w-md">
                  {e.lines.map((l, i) => {
                    const acc = accounts.find(a => a.code === l.account_code)
                    return (
                      <div key={i} className="col-span-3 flex justify-between">
                        <span>{l.account_code} — {acc?.name ?? '?'}</span>
                        <span className={l.debit > 0 ? 'text-blue-600' : 'text-purple-600'}>
                          {l.debit > 0 ? `D ${fmt(l.debit)}` : `C ${fmt(l.credit)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 my-8">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Lançamento Manual</h3>
              <button type="button" onClick={() => setModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border p-2.5 rounded-xl text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="ex: Pagamento de renda"
                  className="w-full border p-2.5 rounded-xl text-sm" required />
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={l.account_code} onChange={e => updateLine(i, { account_code: e.target.value })}
                    className="flex-1 border p-2 rounded-lg text-xs" required>
                    <option value="">Conta…</option>
                    {accounts.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" placeholder="Débito" value={l.debit || ''}
                    onChange={e => updateLine(i, { debit: Number(e.target.value), credit: 0 })}
                    className="w-24 border p-2 rounded-lg text-xs" />
                  <input type="number" min="0" step="0.01" placeholder="Crédito" value={l.credit || ''}
                    onChange={e => updateLine(i, { credit: Number(e.target.value), debit: 0 })}
                    className="w-24 border p-2 rounded-lg text-xs" />
                  {lines.length > 2 && (
                    <button type="button" onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addLine} className="text-xs text-cyan-600 font-bold hover:underline">+ Adicionar linha</button>
            </div>

            <div className={`flex justify-between text-sm font-bold px-3 py-2 rounded-xl ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              <span>Débito: {fmt(totalDebit)}</span>
              <span>Crédito: {fmt(totalCredit)}</span>
            </div>

            <button type="submit" disabled={!balanced}
              className="w-full bg-cyan-600 text-white py-2.5 rounded-xl font-bold hover:bg-cyan-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
              Registar Lançamento
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ─── BALANCETE ─── */
function BalanceteTab() {
  const [rows] = useState(() => getTrialBalance())
  const totalDebit  = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="text-left px-5 py-3">Conta</th>
            <th className="text-right px-5 py-3">Débito</th>
            <th className="text-right px-5 py-3">Crédito</th>
            <th className="text-right px-5 py-3">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="text-center text-gray-400 py-10">Sem movimentos ainda</td></tr>
          ) : rows.map(r => (
            <tr key={r.account.id} className="hover:bg-gray-50">
              <td className="px-5 py-2.5"><span className="font-mono text-gray-400 mr-2">{r.account.code}</span>{r.account.name}</td>
              <td className="text-right px-5 py-2.5 text-blue-600">{r.debit > 0 ? fmt(r.debit) : '—'}</td>
              <td className="text-right px-5 py-2.5 text-purple-600">{r.credit > 0 ? fmt(r.credit) : '—'}</td>
              <td className="text-right px-5 py-2.5 font-bold">{fmt(Math.abs(r.balance))} {r.balance >= 0 ? 'D' : 'C'}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-gray-50 font-bold text-sm">
            <tr>
              <td className="px-5 py-3">Total</td>
              <td className="text-right px-5 py-3 text-blue-700">{fmt(totalDebit)}</td>
              <td className="text-right px-5 py-3 text-purple-700">{fmt(totalCredit)}</td>
              <td className={`text-right px-5 py-3 ${totalDebit === totalCredit ? 'text-green-600' : 'text-red-600'}`}>
                {totalDebit === totalCredit ? '✓ Equilibrado' : '⚠ Desequilibrado'}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

/* ─── DEMONSTRAÇÃO DE RESULTADOS ─── */
function DRETab() {
  const [dre] = useState(() => getIncomeStatement())

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 max-w-2xl space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-2xl p-4">
          <p className="text-xs text-green-600 font-bold uppercase">Proveitos</p>
          <p className="text-xl font-black text-green-700 mt-1">{fmt(dre.proveitos)}</p>
        </div>
        <div className="bg-red-50 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-bold uppercase">Custos</p>
          <p className="text-xl font-black text-red-700 mt-1">{fmt(dre.custos)}</p>
        </div>
        <div className={`rounded-2xl p-4 ${dre.resultadoLiquido >= 0 ? 'bg-cyan-50' : 'bg-orange-50'}`}>
          <p className={`text-xs font-bold uppercase ${dre.resultadoLiquido >= 0 ? 'text-cyan-600' : 'text-orange-600'}`}>Resultado Líquido</p>
          <p className={`text-xl font-black mt-1 ${dre.resultadoLiquido >= 0 ? 'text-cyan-700' : 'text-orange-700'}`}>{fmt(dre.resultadoLiquido)}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody className="divide-y">
          {dre.linhas.length === 0 ? (
            <tr><td className="text-center text-gray-400 py-8">Sem movimentos ainda</td></tr>
          ) : dre.linhas.map(l => (
            <tr key={l.account.id}>
              <td className="py-2"><span className="font-mono text-gray-400 mr-2">{l.account.code}</span>{l.account.name}</td>
              <td className={`text-right py-2 font-bold ${l.account.class === 7 ? 'text-green-600' : 'text-red-600'}`}>{fmt(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── BALANÇO ─── */
function BalancoTab() {
  const [b] = useState(() => getBalanceSheet())
  const balanced = b.totalActivo === b.totalPassivoMaisCapital

  const Section = ({ title, items, total }: { title: string; items: { account: AccountingAccount; total: number }[]; total: number }) => (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h4 className="font-bold text-gray-700 mb-3">{title}</h4>
      {items.length === 0 ? <p className="text-sm text-gray-400">Sem saldo</p> : (
        <div className="space-y-1.5 text-sm">
          {items.map(i => (
            <div key={i.account.id} className="flex justify-between">
              <span><span className="font-mono text-gray-400 mr-2">{i.account.code}</span>{i.account.name}</span>
              <span className="font-medium">{fmt(i.total)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between font-bold border-t pt-2 mt-3">
        <span>Total</span><span>{fmt(total)}</span>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Activo" items={b.activo} total={b.totalActivo} />
        <div className="space-y-4">
          <Section title="Passivo" items={b.passivo} total={b.passivo.reduce((s, i) => s + i.total, 0)} />
          <Section title="Capital Próprio" items={[...b.capitalProprio, ...(b.resultadoPeriodo !== 0 ? [{ account: { id: 'resultado', code: '88', name: 'Resultado do Período', class: 8, nature: 'credora', editable: false } as AccountingAccount, total: b.resultadoPeriodo }] : [])]} total={b.totalPassivoMaisCapital - b.passivo.reduce((s, i) => s + i.total, 0)} />
        </div>
      </div>
      <div className={`rounded-2xl p-4 text-center font-bold ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
        {balanced ? `✓ Balanço equilibrado — ${fmt(b.totalActivo)}` : `⚠ Activo (${fmt(b.totalActivo)}) ≠ Passivo + Capital (${fmt(b.totalPassivoMaisCapital)})`}
      </div>
    </div>
  )
}
