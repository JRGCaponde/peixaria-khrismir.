import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { Fish, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' })
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!form.email || !form.password) {
      toast.error('Preencha todos os campos')
      return
    }

    if (!isLogin) {
      // Cadastro de novo cliente
      const storedClients = localStorage.getItem('khrismir_clients')
      const clients = storedClients ? JSON.parse(storedClients) : []
      
      const existingClient = clients.find((c: any) => c.email === form.email)
      if (existingClient) {
        toast.error('Este email já está cadastrado')
        return
      }
      
      const newClient = {
        id: Date.now().toString(),
        email: form.email,
        password: form.password,
        full_name: form.name || 'Cliente',
        phone: form.phone || '',
        role: 'client',
        created_at: new Date().toISOString()
      }
      
      clients.push(newClient)
      localStorage.setItem('khrismir_clients', JSON.stringify(clients))
      
      toast.success('Cadastro realizado com sucesso! Faça login.')
      setIsLogin(true)
      setForm({ email: '', password: '', name: '', phone: '' })
      return
    }

    // Login
    const success = login(form.email, form.password)
    
    if (success) {
      const user = useAuthStore.getState().user
      toast.success(`Bem-vindo, ${user?.full_name}!`)
      
      if (user?.role === 'admin') {
        navigate('/admin')
      } else if (user?.role === 'employee') {
        navigate('/pos')
      } else {
        navigate('/catalog')
      }
    } else {
      toast.error('Email ou senha incorretos')
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white/20 p-3 rounded-full">
              <Fish className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white">
            {isLogin ? 'Entrar' : 'Criar Conta'}
          </h2>
          <p className="text-cyan-100">
            {isLogin ? 'Acesse sua conta' : 'Cadastre-se na Peixaria Khrismir'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telemóvel</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="9xx xxx xxx"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 pr-12"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-cyan-700 hover:to-blue-700 transition"
          >
            {isLogin ? 'Entrar' : 'Criar Conta'}
          </button>

          <p className="text-center text-gray-600">
            {isLogin ? 'Não tem conta? ' : 'Já tem conta? '}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-cyan-600 font-medium hover:underline"
            >
              {isLogin ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </form>

        {/* Demo Credentials */}
        <div className="px-8 pb-8">
          <div className="bg-gray-100 rounded-lg p-4 text-sm">
            <p className="font-medium text-gray-700 mb-2">Contas de demonstração:</p>
            <div className="space-y-1 text-gray-600">
              <p><strong>Admin:</strong> jorgeamaral2009@gmail.com / podescre0</p>
              <p><strong>Funcionário:</strong> func@peixaria.com / 123456</p>
              <p><strong>Cliente:</strong> cliente@peixaria.com / 123456</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
