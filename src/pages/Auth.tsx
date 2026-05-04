import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { Fish, Eye, EyeOff, Mail, ArrowLeft, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import CryptoJS from 'crypto-js'
import { supabase, isSupabaseReady } from '../lib/supabase'

type View = 'login' | 'register' | 'forgot' | 'reset'

export default function Auth() {
  const [view, setView] = useState<View>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '', code: '', newPass: '', confirmPass: '' })
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [resetCode, setResetCode] = useState<string | null>(null)
  const { login, requestReset, resetPassword } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockedUntil && Date.now() < lockedUntil) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000)
      toast.error(`Conta bloqueada. Tente novamente em ${mins} min.`)
      return
    }
    const result = await login(form.email, form.password)
    if (result.ok) {
      const user = useAuthStore.getState().user
      toast.success(`Bem-vindo, ${user?.full_name}!`)
      if (user?.role === 'admin') navigate('/admin')
      else if (user?.role === 'employee') navigate('/pos')
      else navigate('/catalog')
    } else if (result.lockedUntil) {
      setLockedUntil(result.lockedUntil)
      toast.error('Demasiadas tentativas. Conta bloqueada por 15 minutos.')
    } else {
      toast.error('Email ou senha incorretos')
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres'); return }

    // ── Via Supabase ──
    if (isSupabaseReady() && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.name || 'Cliente', phone: form.phone || '', role: 'client' } },
      })
      if (error) { toast.error(error.message); return }
      // Inserir perfil imediatamente (o trigger faz o mesmo, mas esta linha garante mesmo sem trigger)
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: form.email,
          full_name: form.name || 'Cliente',
          phone: form.phone || '',
          role: 'client',
          created_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      }
      toast.success('Conta criada! Faça login.')
      setView('login')
      setForm(f => ({ ...f, password: '', name: '', phone: '' }))
      return
    }

    // ── Via localStorage ──
    const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
    if (clients.find((c: any) => c.email.toLowerCase() === form.email.toLowerCase())) {
      toast.error('Este email já está cadastrado'); return
    }
    const newClient = {
      id: Date.now().toString(),
      email: form.email,
      password: CryptoJS.SHA256(form.password).toString(),
      full_name: form.name || 'Cliente',
      phone: form.phone || '',
      role: 'client',
      created_at: new Date().toISOString(),
    }
    localStorage.setItem('khrismir_clients', JSON.stringify([...clients, newClient]))
    toast.success('Conta criada! Faça login.')
    setView('login')
    setForm(f => ({ ...f, password: '', name: '', phone: '' }))
  }

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault()
    const code = requestReset(form.email)
    if (!code) { toast.error('Email não encontrado'); return }
    if (code === '__supabase__') {
      toast.success('Email de recuperação enviado! Verifique a sua caixa de entrada.')
      setView('login')
      return
    }
    setResetCode(code)
    setView('reset')
    toast.success('Código de recuperação gerado!')
  }

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPass !== form.confirmPass) { toast.error('As senhas não coincidem'); return }
    if (form.newPass.length < 6) { toast.error('Mínimo 6 caracteres'); return }
    const ok = resetPassword(form.email, form.newPass, form.code)
    if (ok) {
      toast.success('Senha alterada! Faça login.')
      setView('login')
      setResetCode(null)
      setForm(f => ({ ...f, code: '', newPass: '', confirmPass: '' }))
    } else {
      toast.error('Código inválido ou expirado')
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white/20 p-3 rounded-full">
              <Fish className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white">
            {view === 'login'    ? 'Entrar'             :
             view === 'register' ? 'Criar Conta'        :
             view === 'forgot'   ? 'Recuperar Senha'    :
                                   'Nova Senha'}
          </h2>
          <p className="text-cyan-100 text-sm mt-1">Peixaria Khrismir</p>
        </div>

        {/* Login */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="p-8 space-y-4">
            {lockedUntil && Date.now() < lockedUntil && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 text-center">
                Conta bloqueada. Aguarde {Math.ceil((lockedUntil - Date.now()) / 60000)} min.
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                placeholder="seu@email.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 pr-12"
                  placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <button type="button" onClick={() => setView('forgot')}
                className="mt-1 text-xs text-cyan-600 hover:underline float-right">
                Esqueceu a senha?
              </button>
            </div>
            <button type="submit"
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition mt-2">
              Entrar
            </button>
            <p className="text-center text-gray-600 text-sm">
              Não tem conta?{' '}
              <button type="button" onClick={() => setView('register')} className="text-cyan-600 font-medium hover:underline">
                Cadastre-se
              </button>
            </p>
          </form>
        )}

        {/* Register */}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="p-8 space-y-4">
            {[
              { field: 'name',  label: 'Nome Completo', type: 'text',     placeholder: 'Seu nome completo' },
              { field: 'phone', label: 'Telemóvel',     type: 'tel',      placeholder: '+244 9XX XXX XXX'  },
              { field: 'email', label: 'Email',         type: 'email',    placeholder: 'seu@email.com'     },
            ].map(({ field, label, type, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type={type} value={(form as any)[field]} placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  required={field === 'email'} />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha (mín. 6 caracteres)</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 pr-12"
                  placeholder="••••••••" required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit"
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition">
              Criar Conta
            </button>
            <p className="text-center text-gray-600 text-sm">
              Já tem conta?{' '}
              <button type="button" onClick={() => setView('login')} className="text-cyan-600 font-medium hover:underline">
                Entrar
              </button>
            </p>
          </form>
        )}

        {/* Forgot */}
        {view === 'forgot' && (
          <form onSubmit={handleForgot} className="p-8 space-y-4">
            <p className="text-sm text-gray-500">Introduza o seu email. Receberá um código de 6 dígitos para redefinir a sua senha.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                  placeholder="seu@email.com" required />
              </div>
            </div>
            <button type="submit"
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition">
              Gerar Código
            </button>
            <button type="button" onClick={() => setView('login')}
              className="w-full flex items-center justify-center gap-2 text-gray-500 text-sm hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" /> Voltar ao login
            </button>
          </form>
        )}

        {/* Reset */}
        {view === 'reset' && (
          <form onSubmit={handleReset} className="p-8 space-y-4">
            {resetCode && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p className="text-xs text-amber-600 font-medium mb-1">O seu código de recuperação:</p>
                <p className="text-3xl font-black tracking-widest text-amber-800">{resetCode}</p>
                <p className="text-xs text-amber-500 mt-1">Válido por 30 minutos</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de 6 dígitos</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 tracking-widest text-lg text-center"
                  placeholder="000000" maxLength={6} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
              <input type="password" value={form.newPass} onChange={e => setForm(f => ({ ...f, newPass: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                placeholder="Mínimo 6 caracteres" required minLength={6} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nova Senha</label>
              <input type="password" value={form.confirmPass} onChange={e => setForm(f => ({ ...f, confirmPass: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
                placeholder="Repetir nova senha" required />
            </div>
            <button type="submit"
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition">
              Redefinir Senha
            </button>
            <button type="button" onClick={() => { setView('login'); setResetCode(null) }}
              className="w-full flex items-center justify-center gap-2 text-gray-500 text-sm hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" /> Voltar ao login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
