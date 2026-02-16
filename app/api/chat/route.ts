import { NextRequest, NextResponse } from 'next/server'

// POST /api/chat — stream a chat response from Ollama
export async function POST(req: NextRequest) {
  try {
    const { messages, model } = await req.json()

    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3.2',
        messages,
        stream: true,
      }),
    })

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text()
      return NextResponse.json(
        { error: `Ollama error: ${ollamaRes.status} ${text}` },
        { status: ollamaRes.status }
      )
    }

    // Pipe Ollama's NDJSON stream → plain text stream to client
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaRes.body?.getReader()
        if (!reader) { controller.close(); return }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const lines = decoder.decode(value, { stream: true }).split('\n')
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const json = JSON.parse(line)
                if (json.message?.content) {
                  controller.enqueue(encoder.encode(json.message.content))
                }
              } catch {
                // skip malformed lines
              }
            }
          }
        } catch (err) {
          controller.error(err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Cannot connect to Ollama. Make sure it is running: ollama serve' },
      { status: 503 }
    )
  }
}

// GET /api/chat — list available Ollama models
export async function GET() {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error('bad response')
    const data = await res.json()
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name)
    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ models: [], error: 'Ollama not reachable' }, { status: 503 })
  }
}
