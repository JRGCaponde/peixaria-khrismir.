import { Fish, Truck, ChefHat, Phone, MapPin, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-cyan-700 via-cyan-600 to-blue-700 text-white py-20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-30"></div>
        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-white/20 p-4 rounded-full">
              <Fish className="w-16 h-16" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Peixaria Khrismir</h1>
          <p className="text-xl md:text-2xl text-cyan-100 mb-8">Frescor do Mar à sua Mesa</p>
          <p className="text-lg text-cyan-50 max-w-2xl mx-auto mb-8">
            Os melhores peixes e mariscos frescos de Angola. Qualidade garantida, 
            preparo personalizado e entrega no conforto da sua casa.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/auth"
              className="bg-white text-cyan-700 hover:bg-cyan-50 px-8 py-3 rounded-xl font-semibold text-lg transition shadow-lg"
            >
              Entrar como Cliente
            </Link>
            <Link
              to="/auth"
              className="bg-cyan-800 hover:bg-cyan-900 text-white px-8 py-3 rounded-xl font-semibold text-lg transition border border-cyan-500"
            >
              Acesso Funcionário
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">Por que escolher a Khrismir?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 p-8 rounded-2xl shadow-lg border border-cyan-100">
              <div className="bg-cyan-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Fish className="w-8 h-8 text-cyan-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-800">Produtos Frescos</h3>
              <p className="text-gray-600">
                Peixes e mariscos selecionados diariamente. Qualidade superior direto do mar para a sua mesa.
              </p>
            </div>
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 p-8 rounded-2xl shadow-lg border border-cyan-100">
              <div className="bg-cyan-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Truck className="w-8 h-8 text-cyan-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-800">Encomendas Online</h3>
              <p className="text-gray-600">
                Faça sua encomenda de qualquer lugar. Entregamos em toda a cidade de Lubango com rapidez.
              </p>
            </div>
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 p-8 rounded-2xl shadow-lg border border-cyan-100">
              <div className="bg-cyan-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <ChefHat className="w-8 h-8 text-cyan-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-800">Preparo Personalizado</h3>
              <p className="text-gray-600">
                Escolha como quer seu peixe: inteiro, limpo, filé ou posta. Nós preparamos do jeito que você preferir.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Info */}
      <section className="py-16 bg-gradient-to-br from-cyan-50 to-blue-100">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">Contacte-nos</h2>
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg flex items-start gap-4">
              <div className="bg-cyan-100 p-3 rounded-full">
                <MapPin className="w-6 h-6 text-cyan-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Morada</h3>
                <p className="text-gray-600">
                  Centralidade da Quilemba, Lubango, Huíla<br />
                  Segunda entrada, lado esquerdo
                </p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg flex items-start gap-4">
              <div className="bg-cyan-100 p-3 rounded-full">
                <Phone className="w-6 h-6 text-cyan-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Telefones</h3>
                <p className="text-gray-600">
                  +244 929 970 984 / +244 924 359 638<br />
                  <span className="text-green-600 font-medium">WhatsApp: +244 929 970 984</span>
                </p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg flex items-start gap-4">
              <div className="bg-cyan-100 p-3 rounded-full">
                <Clock className="w-6 h-6 text-cyan-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Horário de Funcionamento</h3>
                <p className="text-gray-600">
                  Segunda a Sábado: 07:00 - 19:00<br />
                  Domingos: 07:00 - 13:00
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">© 2024 Peixaria Khrismir. Todos os direitos reservados.</p>
          <p className="text-sm text-gray-500 mt-2">Frescor do Mar à sua Mesa</p>
        </div>
      </footer>
    </div>
  )
}
