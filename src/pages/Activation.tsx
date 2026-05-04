import { useState } from 'react'
import { Fish, Key, Clock, CheckCircle } from 'lucide-react'
import { activateLicense, getDaysRemaining, isTrialActive, generateLicenseKey } from '../lib/license'
import { toast } from 'sonner'

interface Props {
  onActivated: () => void
}

export default function Activation({ onActivated }: Props) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const daysLeft = getDaysRemaining()
  const trialActive = isTrialActive()

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const ok = await activateLicense(key)
    if (ok) {
      toast.success('Licença activada com sucesso!')
      onActivated()
    } else {
      toast.error('Chave de licença inválida. Verifique e tente novamente.')
    }
    setLoading(false)
  }

  // Dev helper: expose key generator in console
  if (typeof window !== 'undefined') {
    (window as any).__genKey = generateLicenseKey
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-700 via-cyan-600 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="bg-cyan-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Fish className="w-10 h-10 text-cyan-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-800">Peixaria Khrismir</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Gestão</p>
        </div>

        {trialActive && daysLeft > 3 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800">Período de Avaliação</p>
              <p className="text-sm text-amber-700">Restam <strong>{daysLeft} dias</strong> de utilização gratuita.</p>
            </div>
          </div>
        ) : trialActive ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <Clock className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-800">Avaliação a terminar!</p>
              <p className="text-sm text-red-700">Restam apenas <strong>{daysLeft} dias</strong>. Active a licença para continuar.</p>
            </div>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <p className="font-bold text-red-800 text-center">Período de avaliação expirado</p>
            <p className="text-sm text-red-600 text-center mt-1">Active a licença para continuar a usar o sistema.</p>
          </div>
        )}

        <form onSubmit={handleActivate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Key className="w-4 h-4 inline mr-1" />Chave de Licença
            </label>
            <input
              type="text"
              value={key}
              onChange={e => setKey(e.target.value.toUpperCase())}
              placeholder="KHRIS-XXXX-XXXX-XXXX"
              className="w-full border border-gray-300 p-3 rounded-xl font-mono tracking-widest text-center focus:ring-2 focus:ring-cyan-500 focus:border-transparent uppercase"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-bold hover:from-cyan-700 hover:to-blue-700 transition disabled:opacity-60"
          >
            {loading ? 'A verificar...' : 'Activar Licença'}
          </button>
        </form>

        {trialActive && (
          <button
            onClick={onActivated}
            className="w-full mt-3 text-gray-400 text-sm hover:text-gray-600 transition"
          >
            Continuar com avaliação ({daysLeft} dias restantes)
          </button>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">Para adquirir uma licença, contacte:</p>
          <p className="text-xs font-medium text-cyan-600 mt-1">Khrismir — Sistema de Gestão de Peixaria</p>
          <div className="flex items-center justify-center gap-2 mt-2 text-xs text-green-600">
            <CheckCircle className="w-3 h-3" />
            <span>Versão 1.5</span>
          </div>
        </div>
      </div>
    </div>
  )
}
