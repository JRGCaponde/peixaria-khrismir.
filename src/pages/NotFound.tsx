import { Link } from 'react-router-dom'
import { Home, AlertCircle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      
      <div className="bg-red-100 p-4 rounded-full mb-6">
        <AlertCircle size={48} className="text-red-500" />
      </div>
      
      <h1 className="text-8xl font-bold text-gray-200">404</h1>
      
      <h2 className="text-2xl font-semibold text-gray-700 mt-2">
        Página não encontrada
      </h2>
      
      <p className="text-gray-500 mt-3 max-w-md">
        A página que você procura não existe ou foi movida.
      </p>
      
      <Link 
        to="/" 
        className="mt-8 flex items-center gap-2 px-6 py-3 
                   bg-cyan-600 text-white rounded-xl 
                   hover:bg-cyan-700 transition-all 
                   shadow-lg hover:shadow-xl"
      >
        <Home size={20} />
        Voltar ao início
      </Link>
    </div>
  )
}
