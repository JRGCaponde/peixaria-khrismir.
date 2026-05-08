import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { question, context } = req.body
  if (!question) return res.status(400).json({ error: 'Missing question' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  const systemPrompt = `Tu és o assistente inteligente da Peixaria Khrismir, uma peixaria em Angola.
Respondes SEMPRE em português de Portugal/Angola, de forma natural e simpática.
Chama o utilizador de "chefe" de vez em quando.
Sê conciso — respostas curtas e directas, como se estivesses a falar.
Usa "Kz" como moeda (Kwanza angolano).
Formata números no estilo português (ponto para milhares).

Tens acesso aos dados reais do negócio que te são fornecidos no contexto.
Analisa os dados e responde com base neles.
Se não tiveres dados suficientes, diz honestamente.
Nunca inventes números — usa apenas os dados fornecidos.

Também podes:
- Dar conselhos de negócio baseados nos dados
- Sugerir acções (ex: "devias reabastecer o carapau")
- Comparar períodos
- Identificar tendências

Se te perguntarem sobre casa inteligente ou IoT, responde que podes ajudar a controlar dispositivos se estiverem configurados.

IMPORTANTE: Responde como se estivesses a FALAR — frases curtas, sem markdown, sem listas com bullets. Máximo 3-4 frases.`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Dados actuais do negócio:\n${context}\n\nPergunta do chefe: ${question}`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    return res.status(200).json({ answer: text })
  } catch (err: any) {
    console.error('Claude API error:', err)
    return res.status(500).json({ error: 'Erro ao contactar o assistente IA' })
  }
}
