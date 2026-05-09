import { useState } from 'react'
import { useAuthStore } from '../stores/useAuthStore'
import { toast } from 'sonner'
import CryptoJS from 'crypto-js'
import { User, Phone, Mail, Lock, Save, Shield } from 'lucide-react'

export default function Profile() {
  const { user } = useAuthStore()

  const [form, setForm] = useState({
    full_name:       user?.full_name || '',
    phone:           user?.phone     || '',
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
  })

  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim()) { toast.error('O nome não pode estar vazio'); return }

    const stored  = localStorage.getItem('khrismir_clients')
    const clients: any[] = stored ? JSON.parse(stored) : []
    const updated = clients.map((c: any) =>
      c.id === user?.id ? { ...c, full_name: form.full_name.trim(), phone: form.phone.trim() } : c,
    )
    localStorage.setItem('khrismir_clients', JSON.stringify(updated))
    toast.success('Perfil atualizado com sucesso!')
  }

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      toast.error('Preencha todos os campos de senha'); return
    }
    if (form.newPassword.length < 6)             { toast.error('A nova senha deve ter pelo menos 6 caracteres'); return }
    if (form.newPassword !== form.confirmPassword) { toast.error('As senhas não coincidem'); return }

    const stored  = localStorage.getItem('khrismir_clients')
    const clients: any[] = stored ? JSON.parse(stored) : []
    const currentUser = clients.find((c: any) => c.id === user?.id)
    if (!currentUser) { toast.error('Utilizador não encontrado'); return }

    if (currentUser.password !== CryptoJS.SHA256(form.currentPassword).toString()) {
      toast.error('Senha atual incorreta'); return
    }

    const updated = clients.map((c: any) =>
      c.id === user?.id ? { ...c, password: CryptoJS.SHA256(form.newPassword).toString() } : c,
    )
    localStorage.setItem('khrismir_clients', JSON.stringify(updated))
    setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }))
    toast.success('Senha alterada com sucesso!')
  }

  const roleBadge: Record<string, { label: string; color: string }> = {
    admin:    { label: 'Administrador', color: 'bg-red-100 text-red-700'   },
    employee: { label: 'Funcionário',   color: 'bg-blue-100 text-blue-700' },
    client:   { label: 'Cliente',       color: 'bg-green-100 text-green-700' },
  }
  const badge = roleBadge[user?.role ?? 'client']

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 px-1 sm:px-0">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-cyan-700 to-blue-700 rounded-2xl p-4 sm:p-6 text-white flex flex-col sm:flex-row items-center sm:items-center gap-3 sm:gap-5 text-center sm:text-left">
        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="w-7 h-7 sm:w-8 sm:h-8" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{user?.full_name}</h1>
          <p className="text-cyan-200 text-sm sm:text-base break-all">{user?.email}</p>
          <span className={`mt-1 inline-flex items-center gap-1 text-xs font-bold px-3 py-0.5 rounded-full ${badge.color}`}>
            <Shield className="w-3 h-3" /> {badge.label}
          </span>
        </div>
      </div>

      {/* Informações pessoais */}
      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
          <User className="w-5 h-5 text-cyan-600" /> Informações Pessoais
        </h2>
        <form onSubmit={handleSaveInfo} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telemóvel</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="tel" value={form.phone} placeholder="+244 9XX XXX XXX"
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="email" value={user?.email} disabled
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">O email não pode ser alterado.</p>
          </div>
          <button type="submit"
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" /> Guardar Alterações
          </button>
        </form>
      </div>

      {/* Alterar senha */}
      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
          <Lock className="w-5 h-5 text-cyan-600" /> Alterar Senha
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {[
            { field: 'currentPassword', label: 'Senha Atual',         placeholder: '••••••••' },
            { field: 'newPassword',     label: 'Nova Senha',          placeholder: 'Mínimo 6 caracteres' },
            { field: 'confirmPassword', label: 'Confirmar Nova Senha', placeholder: 'Repetir nova senha' },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="password" value={(form as any)[field]} placeholder={placeholder}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          ))}
          <button type="submit"
            className="w-full bg-gray-800 text-white py-3 rounded-xl font-semibold hover:bg-gray-900 transition flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" /> Alterar Senha
          </button>
        </form>
      </div>
    </div>
  )
}
