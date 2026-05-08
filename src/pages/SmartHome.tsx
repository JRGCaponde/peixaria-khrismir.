import { useState, useCallback } from 'react'
import {
  Lightbulb, Thermometer, Fan, Tv, Lock, Unlock,
  Power, WifiOff, Plus, Trash2, ArrowLeft,
  Sun, Moon, Mic, Volume2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { speak } from '../lib/voiceAssistant'

interface Device {
  id: string
  name: string
  room: string
  type: 'light' | 'ac' | 'fan' | 'tv' | 'lock' | 'plug'
  on: boolean
  value?: number
  color?: string
}

const ICONS = {
  light: Lightbulb,
  ac: Thermometer,
  fan: Fan,
  tv: Tv,
  lock: Lock,
  plug: Power,
}

const DEVICE_COLORS = {
  light: { on: 'from-amber-400 to-yellow-500', off: 'from-slate-300 to-slate-400' },
  ac: { on: 'from-blue-400 to-cyan-500', off: 'from-slate-300 to-slate-400' },
  fan: { on: 'from-cyan-400 to-teal-500', off: 'from-slate-300 to-slate-400' },
  tv: { on: 'from-purple-400 to-indigo-500', off: 'from-slate-300 to-slate-400' },
  lock: { on: 'from-green-400 to-emerald-500', off: 'from-red-400 to-rose-500' },
  plug: { on: 'from-green-400 to-emerald-500', off: 'from-slate-300 to-slate-400' },
}

const DEFAULT_DEVICES: Device[] = [
  { id: '1', name: 'Luz Principal', room: 'Sala', type: 'light', on: true, value: 80 },
  { id: '2', name: 'Ar Condicionado', room: 'Sala', type: 'ac', on: false, value: 22 },
  { id: '3', name: 'Ventilador', room: 'Quarto', type: 'fan', on: false, value: 2 },
  { id: '4', name: 'TV', room: 'Sala', type: 'tv', on: true },
  { id: '5', name: 'Fechadura', room: 'Entrada', type: 'lock', on: true },
  { id: '6', name: 'Luz Quarto', room: 'Quarto', type: 'light', on: false, value: 60 },
  { id: '7', name: 'Luz Cozinha', room: 'Cozinha', type: 'light', on: false, value: 100 },
  { id: '8', name: 'Ar Quarto', room: 'Quarto', type: 'ac', on: false, value: 24 },
]

function lsDevices(): Device[] {
  try { return JSON.parse(localStorage.getItem('khrismir_smart_home') || 'null') ?? DEFAULT_DEVICES } catch { return DEFAULT_DEVICES }
}

export default function SmartHome() {
  const navigate = useNavigate()
  const [devices, setDevices] = useState<Device[]>(lsDevices)
  const [selectedRoom, setSelectedRoom] = useState<string>('Todos')
  const [showAdd, setShowAdd] = useState(false)
  const [newDevice, setNewDevice] = useState({ name: '', room: 'Sala', type: 'light' as Device['type'] })
  const [voiceStatus, setVoiceStatus] = useState<string>('')

  const save = (d: Device[]) => {
    setDevices(d)
    localStorage.setItem('khrismir_smart_home', JSON.stringify(d))
  }

  const toggle = (id: string) => {
    save(devices.map(d => d.id === id ? { ...d, on: !d.on } : d))
  }

  const updateValue = (id: string, value: number) => {
    save(devices.map(d => d.id === id ? { ...d, value } : d))
  }

  const addDevice = () => {
    if (!newDevice.name.trim()) return
    const device: Device = {
      id: Date.now().toString(),
      name: newDevice.name,
      room: newDevice.room,
      type: newDevice.type,
      on: false,
      value: newDevice.type === 'ac' ? 22 : newDevice.type === 'light' ? 80 : undefined,
    }
    save([...devices, device])
    setNewDevice({ name: '', room: 'Sala', type: 'light' })
    setShowAdd(false)
  }

  const removeDevice = (id: string) => {
    save(devices.filter(d => d.id !== id))
  }

  const rooms = ['Todos', ...Array.from(new Set(devices.map(d => d.room)))]
  const filtered = selectedRoom === 'Todos' ? devices : devices.filter(d => d.room === selectedRoom)
  const onCount = devices.filter(d => d.on).length
  const totalCount = devices.length

  const handleVoiceCommand = useCallback((text: string) => {
    const q = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

    let acted = false

    if (/acend|liga.*luz|ligue.*luz/.test(q)) {
      const room = rooms.find(r => r !== 'Todos' && q.includes(r.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')))
      save(devices.map(d => d.type === 'light' && (!room || d.room === room) ? { ...d, on: true } : d))
      setVoiceStatus(room ? `Luzes da ${room} acesas!` : 'Todas as luzes acesas!')
      acted = true
    }

    if (/apag|deslig.*luz|desligue.*luz/.test(q)) {
      const room = rooms.find(r => r !== 'Todos' && q.includes(r.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')))
      save(devices.map(d => d.type === 'light' && (!room || d.room === room) ? { ...d, on: false } : d))
      setVoiceStatus(room ? `Luzes da ${room} apagadas!` : 'Todas as luzes apagadas!')
      acted = true
    }

    if (/liga.*ar|ligue.*ar|ar.*condicionado.*liga/.test(q)) {
      const temp = q.match(/(\d{2})\s*(grau|°)/)
      save(devices.map(d => d.type === 'ac' ? { ...d, on: true, value: temp ? parseInt(temp[1]) : d.value } : d))
      setVoiceStatus(temp ? `Ar ligado a ${temp[1]}°C!` : 'Ar condicionado ligado!')
      acted = true
    }

    if (/deslig.*ar|desligue.*ar/.test(q)) {
      save(devices.map(d => d.type === 'ac' ? { ...d, on: false } : d))
      setVoiceStatus('Ar condicionado desligado!')
      acted = true
    }

    if (/tranc|fecha|lock/.test(q)) {
      save(devices.map(d => d.type === 'lock' ? { ...d, on: true } : d))
      setVoiceStatus('Casa trancada!')
      acted = true
    }

    if (/destranc|abr.*fechadura|unlock/.test(q)) {
      save(devices.map(d => d.type === 'lock' ? { ...d, on: false } : d))
      setVoiceStatus('Fechadura aberta!')
      acted = true
    }

    if (/desliga.*tudo|tudo.*off/.test(q)) {
      save(devices.map(d => d.type === 'lock' ? d : { ...d, on: false }))
      setVoiceStatus('Tudo desligado! Só a fechadura ficou.')
      acted = true
    }

    if (/cheguei|estou em casa|modo casa/.test(q)) {
      save(devices.map(d => {
        if (d.type === 'light' && d.room === 'Sala') return { ...d, on: true }
        if (d.type === 'lock') return { ...d, on: true }
        return d
      }))
      setVoiceStatus('Bem-vindo! Luz da sala acesa, casa trancada.')
      acted = true
    }

    if (/vou sair|saindo|modo.*sair/.test(q)) {
      save(devices.map(d => d.type === 'lock' ? { ...d, on: true } : { ...d, on: false }))
      setVoiceStatus('Tudo desligado e casa trancada. Bom passeio, chefe!')
      acted = true
    }

    if (acted) {
      speak(voiceStatus || 'Feito!', () => setVoiceStatus(''))
    } else {
      setVoiceStatus('Não entendi o comando. Tenta: "acende a luz", "liga o ar a 22 graus", "tranca a casa".')
      speak('Não entendi. Tenta dizer acende a luz ou liga o ar.', () => setVoiceStatus(''))
    }
  }, [devices, rooms, voiceStatus])

  const isNight = new Date().getHours() >= 18 || new Date().getHours() < 6

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/60 transition">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            {isNight ? <Moon size={24} className="text-indigo-500" /> : <Sun size={24} className="text-amber-500" />}
            Casa Inteligente
          </h1>
          <p className="text-sm text-slate-500">{onCount} de {totalCount} dispositivos ligados</p>
        </div>
        <button onClick={() => navigate('/assistente')} className="p-2.5 bg-purple-100 rounded-xl hover:bg-purple-200 transition" title="Assistente de voz">
          <Mic size={18} className="text-purple-600" />
        </button>
        <button onClick={() => setShowAdd(true)} className="p-2.5 bg-cyan-100 rounded-xl hover:bg-cyan-200 transition" title="Adicionar dispositivo">
          <Plus size={18} className="text-cyan-600" />
        </button>
      </div>

      {/* Voice Status */}
      {voiceStatus && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-700 flex items-center gap-2 animate-pulse">
          <Volume2 size={16} /> {voiceStatus}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { label: 'Cheguei!', action: () => handleVoiceCommand('cheguei em casa'), icon: '🏠' },
          { label: 'Vou sair', action: () => handleVoiceCommand('vou sair'), icon: '👋' },
          { label: 'Tudo off', action: () => handleVoiceCommand('desliga tudo'), icon: '⚡' },
        ].map(a => (
          <button key={a.label} onClick={a.action}
            className="bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-medium text-slate-700 hover:shadow-md transition flex items-center justify-center gap-2">
            <span>{a.icon}</span> {a.label}
          </button>
        ))}
      </div>

      {/* Room Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {rooms.map(r => (
          <button key={r} onClick={() => setSelectedRoom(r)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${selectedRoom === r ? 'bg-cyan-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            {r}
          </button>
        ))}
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(device => {
          const Icon = device.type === 'lock' && !device.on ? Unlock : ICONS[device.type]
          const colors = DEVICE_COLORS[device.type]
          return (
            <div key={device.id}
              className={`relative rounded-2xl p-4 transition-all duration-300 cursor-pointer hover:shadow-lg ${device.on ? 'bg-white shadow-md border border-slate-100' : 'bg-slate-50 border border-slate-200'}`}
              onClick={() => toggle(device.id)}
            >
              <button onClick={(e) => { e.stopPropagation(); removeDevice(device.id) }}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-red-100 opacity-0 hover:opacity-100 transition">
                <Trash2 size={12} className="text-red-400" />
              </button>

              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br ${device.on ? colors.on : colors.off} text-white shadow-sm`}>
                <Icon size={20} />
              </div>

              <p className="font-medium text-sm text-slate-800 truncate">{device.name}</p>
              <p className="text-xs text-slate-400">{device.room}</p>

              <div className="flex items-center justify-between mt-3">
                <span className={`text-xs font-medium ${device.on ? 'text-green-600' : 'text-slate-400'}`}>
                  {device.type === 'lock' ? (device.on ? 'Trancado' : 'Aberto') : (device.on ? 'Ligado' : 'Desligado')}
                </span>
                <div className={`w-8 h-4 rounded-full transition-all duration-300 ${device.on ? 'bg-green-500' : 'bg-slate-300'} relative`}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all duration-300 ${device.on ? 'left-4' : 'left-0.5'}`} />
                </div>
              </div>

              {/* Value slider for lights and AC */}
              {device.on && device.value !== undefined && (device.type === 'light' || device.type === 'ac') && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{device.type === 'light' ? 'Brilho' : 'Temp.'}</span>
                    <span>{device.value}{device.type === 'ac' ? '°C' : '%'}</span>
                  </div>
                  <input
                    type="range"
                    min={device.type === 'ac' ? 16 : 10}
                    max={device.type === 'ac' ? 30 : 100}
                    value={device.value}
                    onChange={(e) => updateValue(device.id, parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-slate-200 accent-cyan-500"
                  />
                </div>
              )}

              {/* Fan speed for fans */}
              {device.on && device.type === 'fan' && device.value !== undefined && (
                <div className="mt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {[1, 2, 3].map(s => (
                    <button key={s} onClick={() => updateValue(device.id, s)}
                      className={`flex-1 py-1 rounded text-xs font-medium transition ${device.value === s ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Connection Status */}
      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
        <WifiOff size={14} />
        <span>Dispositivos em modo demo — conecte um hub IoT para controlo real</span>
      </div>

      {/* Add Device Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Novo Dispositivo</h3>
            <div className="space-y-3">
              <input value={newDevice.name} onChange={e => setNewDevice(p => ({ ...p, name: e.target.value }))}
                placeholder="Nome (ex: Luz do corredor)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
              <input value={newDevice.room} onChange={e => setNewDevice(p => ({ ...p, room: e.target.value }))}
                placeholder="Divisão (ex: Sala)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
              <select value={newDevice.type} onChange={e => setNewDevice(p => ({ ...p, type: e.target.value as Device['type'] }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm">
                <option value="light">Luz</option>
                <option value="ac">Ar Condicionado</option>
                <option value="fan">Ventilador</option>
                <option value="tv">TV</option>
                <option value="lock">Fechadura</option>
                <option value="plug">Tomada</option>
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={addDevice} className="flex-1 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 transition">Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
