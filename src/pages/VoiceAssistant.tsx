import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Volume2, Trash2, HelpCircle, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { processQuestion, speak } from '../lib/voiceAssistant'

type MessageRole = 'user' | 'assistant'
interface Message { role: MessageRole; text: string; time: string }

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export default function VoiceAssistant() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [transcript, setTranscript] = useState('')
  const [supported] = useState(() => !!SpeechRecognition)
  const recognitionRef = useRef<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices()
  }, [])

  const addMessage = useCallback((role: MessageRole, text: string) => {
    setMessages(prev => [...prev, { role, text, time: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) }])
  }, [])

  const handleAnswer = useCallback((question: string) => {
    setPhase('thinking')
    setTimeout(() => {
      const answer = processQuestion(question)
      addMessage('assistant', answer)
      setPhase('speaking')
      speak(answer, () => setPhase('idle'))
    }, 400)
  }, [addMessage])

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return
    const rec = new SpeechRecognition()
    rec.lang = 'pt-PT'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => { setPhase('listening'); setTranscript('') }
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join('')
      setTranscript(t)
    }
    rec.onend = () => {
      const final = transcript || ''
      if (final.trim()) {
        addMessage('user', final)
        handleAnswer(final)
      } else {
        setPhase('idle')
      }
    }
    rec.onerror = () => setPhase('idle')

    recognitionRef.current = rec
    rec.start()
  }, [transcript, addMessage, handleAnswer])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const toggleMic = () => {
    if (phase === 'speaking') { window.speechSynthesis.cancel(); setPhase('idle'); return }
    if (phase === 'listening') { stopListening(); return }
    if (phase === 'idle') startListening()
  }

  // Fix: capture final transcript on recognition end properly
  useEffect(() => {
    if (!recognitionRef.current) return
    const rec = recognitionRef.current
    rec.onend = () => {
      if (transcript.trim()) {
        addMessage('user', transcript)
        handleAnswer(transcript)
      } else {
        setPhase('idle')
      }
    }
  }, [transcript, addMessage, handleAnswer])

  const phaseLabel = {
    idle: 'Toca no microfone para falar',
    listening: 'A ouvir...',
    thinking: 'A pensar...',
    speaking: 'A responder...',
  }

  const phaseColor = {
    idle: 'from-cyan-500 to-blue-600',
    listening: 'from-red-500 to-pink-600',
    thinking: 'from-amber-500 to-orange-600',
    speaking: 'from-green-500 to-emerald-600',
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/60 transition">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-2xl">🐟</span> Assistente Khrismir
          </h1>
          <p className="text-xs text-slate-500">Pergunte sobre vendas, stock, caixa e mais</p>
        </div>
        <button onClick={() => { addMessage('user', 'ajuda'); handleAnswer('ajuda') }}
          className="p-2 rounded-xl hover:bg-white/60 transition" title="Ajuda">
          <HelpCircle size={18} className="text-slate-400" />
        </button>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="p-2 rounded-xl hover:bg-white/60 transition" title="Limpar conversa">
            <Trash2 size={18} className="text-slate-400" />
          </button>
        )}
      </div>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-6xl mb-4">🎙️</div>
            <p className="text-lg font-medium mb-2">Olá, chefe!</p>
            <p className="text-sm">Pergunte qualquer coisa sobre a peixaria.</p>
            <div className="mt-6 grid grid-cols-2 gap-2 max-w-xs mx-auto text-xs">
              {['Como foram as vendas hoje?', 'Qual o saldo?', 'Produtos em falta?', 'Resumo geral'].map(s => (
                <button key={s} onClick={() => { addMessage('user', s); handleAnswer(s) }}
                  className="bg-white/70 hover:bg-white border border-slate-200 rounded-xl px-3 py-2 text-left text-slate-600 transition hover:shadow-sm">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-br-md'
                : 'bg-white text-slate-700 border border-slate-100 shadow-sm rounded-bl-md'
            }`}>
              {m.role === 'assistant' && <span className="mr-1">🐟</span>}
              {m.text}
              <div className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-cyan-100' : 'text-slate-400'}`}>{m.time}</div>
            </div>
          </div>
        ))}

        {phase === 'thinking' && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transcript preview */}
      {phase === 'listening' && transcript && (
        <div className="text-center text-sm text-slate-500 italic mb-2 animate-pulse">
          "{transcript}"
        </div>
      )}

      {/* Mic Area */}
      <div className="flex flex-col items-center gap-3 py-4">
        <p className="text-xs text-slate-500 font-medium">{phaseLabel[phase]}</p>

        <div className="relative">
          {/* Pulse rings */}
          {(phase === 'listening' || phase === 'speaking') && (
            <>
              <span className={`absolute inset-0 rounded-full bg-gradient-to-r ${phaseColor[phase]} opacity-20 animate-ping`} />
              <span className={`absolute -inset-2 rounded-full bg-gradient-to-r ${phaseColor[phase]} opacity-10 animate-pulse`} />
              <span className={`absolute -inset-4 rounded-full bg-gradient-to-r ${phaseColor[phase]} opacity-5 animate-pulse`} style={{ animationDelay: '500ms' }} />
            </>
          )}

          <button
            onClick={toggleMic}
            disabled={phase === 'thinking' || !supported}
            className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 bg-gradient-to-r ${phaseColor[phase]} text-white`}
          >
            {phase === 'listening' ? <MicOff size={28} /> :
             phase === 'speaking' ? <Volume2 size={28} /> :
             <Mic size={28} />}
          </button>
        </div>

        {!supported && (
          <p className="text-xs text-red-500 text-center mt-1">
            O teu browser não suporta reconhecimento de voz.<br />
            Usa o Chrome ou Edge para esta funcionalidade.
          </p>
        )}
      </div>
    </div>
  )
}
