'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, FileText, RotateCcw, ChevronDown, AlertCircle, Loader2 } from 'lucide-react'
import { SYSTEM_PROMPT, WELCOME_MESSAGE } from '@/lib/systemPrompt'
import PRDViewer from './PRDViewer'

interface Message {
  role: 'user' | 'assistant'
  content: string
  prd?: string        // extracted PRD content (assistant messages only)
  isStreaming?: boolean
}

const PRD_START = '---PRD_START---'
const PRD_END = '---PRD_END---'

function extractPRD(text: string): { before: string; prd: string | null; after: string } {
  const si = text.indexOf(PRD_START)
  const ei = text.indexOf(PRD_END)
  if (si !== -1 && ei !== -1 && ei > si) {
    return {
      before: text.slice(0, si).trim(),
      prd: text.slice(si + PRD_START.length, ei).trim(),
      after: text.slice(ei + PRD_END.length).trim(),
    }
  }
  return { before: text, prd: null, after: '' }
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME_MESSAGE },
  ])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [model, setModel] = useState('llama3.2')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  const [prdToView, setPrdToView] = useState<string | null>(null)
  const [showModelMenu, setShowModelMenu] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Fetch available Ollama models on mount
  useEffect(() => {
    fetch('/api/chat')
      .then(r => r.json())
      .then(data => {
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models)
          setModel(data.models[0])
          setOllamaError(null)
        } else {
          setOllamaError(data.error || 'No models found')
        }
      })
      .catch(() => setOllamaError('Cannot reach Ollama'))
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }, [input])

  const buildApiMessages = useCallback(
    (history: Message[]) =>
      [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.map(m => ({
          role: m.role,
          // Send only the raw text (strip PRD from message if extracted)
          content: m.prd
            ? (m.content + '\n\n' + PRD_START + '\n' + m.prd + '\n' + PRD_END).trim()
            : m.content,
        })),
      ],
    []
  )

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return

      const userMsg: Message = { role: 'user', content: text.trim() }
      const assistantMsg: Message = { role: 'assistant', content: '', isStreaming: true }

      setMessages(prev => [...prev, userMsg, assistantMsg])
      setInput('')
      setIsStreaming(true)

      abortRef.current = new AbortController()

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: buildApiMessages([...messages, userMsg]),
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'API error')
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })

          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: accumulated }
            }
            return updated
          })
        }

        // Stream done — extract PRD if present, finalize message
        const { before, prd } = extractPRD(accumulated)
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: before || accumulated,
              prd: prd ?? undefined,
              isStreaming: false,
            }
          }
          return updated
        })

        if (prd) {
          setPrdToView(prd)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: `_Error: ${errMsg}_`,
              isStreaming: false,
            }
          }
          return updated
        })
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [isStreaming, messages, model, buildApiMessages]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleGeneratePRD = () => {
    sendMessage(
      'Based on everything we have discussed so far, please generate the complete PRD now. Use the ---PRD_START--- and ---PRD_END--- markers.'
    )
  }

  const handleReset = () => {
    if (isStreaming) {
      abortRef.current?.abort()
    }
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }])
    setInput('')
    setIsStreaming(false)
    setPrdToView(null)
  }

  // Check if any PRD has been generated
  const hasPRD = messages.some(m => m.prd)

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-slate-900 text-white shadow-md z-10 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-sm">
              A
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-tight">PRD Generator</h1>
              <p className="text-slate-400 text-xs leading-tight">AI Business Analyst</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Ollama error badge */}
            {ollamaError && (
              <div className="flex items-center gap-1 bg-red-900/40 text-red-300 text-xs px-2 py-1 rounded-md border border-red-700">
                <AlertCircle size={12} />
                <span>Ollama offline</span>
              </div>
            )}

            {/* Model selector */}
            {availableModels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu(v => !v)}
                  className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-md transition-colors"
                >
                  <span className="max-w-32 truncate">{model}</span>
                  <ChevronDown size={12} />
                </button>
                {showModelMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 min-w-48">
                    {availableModels.map(m => (
                      <button
                        key={m}
                        onClick={() => { setModel(m); setShowModelMenu(false) }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                          m === model ? 'text-blue-400 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View last PRD */}
            {hasPRD && (
              <button
                onClick={() => {
                  const last = [...messages].reverse().find(m => m.prd)
                  if (last?.prd) setPrdToView(last.prd)
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-md transition-colors"
              >
                <FileText size={13} />
                View PRD
              </button>
            )}

            {/* Generate PRD */}
            <button
              onClick={handleGeneratePRD}
              disabled={isStreaming || messages.length < 3}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded-md transition-colors"
              title="Generate PRD now based on the conversation so far"
            >
              <FileText size={13} />
              Generate PRD
            </button>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-xs px-2 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
              title="Start over"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Ollama setup hint ── */}
      {ollamaError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-start gap-2 text-amber-800 text-sm">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <div>
              <strong>Ollama is not running.</strong> Start it with{' '}
              <code className="bg-amber-100 px-1 rounded font-mono text-xs">ollama serve</code> and
              make sure you have a model pulled, e.g.{' '}
              <code className="bg-amber-100 px-1 rounded font-mono text-xs">ollama pull llama3.2</code>.
            </div>
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
          {messages.map((msg, idx) => (
            <MessageRow key={idx} msg={msg} onViewPRD={prd => setPrdToView(prd)} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Input bar ── */}
      <div className="border-t border-slate-200 bg-white flex-shrink-0 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your idea or requirement…"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400 placeholder-slate-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
            >
              {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
          <p className="text-slate-400 text-xs mt-1.5 pl-1">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* ── PRD Viewer Modal ── */}
      {prdToView && (
        <PRDViewer prd={prdToView} onClose={() => setPrdToView(null)} />
      )}
    </div>
  )
}

// ── Individual message row ──────────────────────────────────────────────────

function MessageRow({ msg, onViewPRD }: { msg: Message; onViewPRD: (prd: string) => void }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 items-start">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold shadow">
        A
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-slate-100">
          {msg.content ? (
            <div className="msg-markdown text-sm text-slate-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          ) : msg.isStreaming ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
              <span>Thinking…</span>
            </div>
          ) : null}

          {/* PRD generated badge */}
          {msg.prd && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => onViewPRD(msg.prd!)}
                className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-medium px-3 py-2 rounded-lg transition-colors w-full"
              >
                <FileText size={14} className="text-emerald-600 flex-shrink-0" />
                <span>PRD Generated — Click to view &amp; download</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
