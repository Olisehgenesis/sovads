/**
 * Tiny Groq client — OpenAI-compatible chat completions endpoint.
 *
 * Used only at task creation time to translate an advertiser's prompt into
 * a structured VerificationPlan JSON. The plan is then validated, stored,
 * and executed deterministically by lib/verify-executor.ts — Groq is
 * never called per user.
 *
 * Env:
 *   GROQ_API_KEY (preferred) or `groq` (lowercase fallback)
 *   GROQ_MODEL   (optional, default: llama-3.3-70b-versatile)
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

function getApiKey(): string | null {
  const v = (process.env.GROQ_API_KEY || process.env.groq || '').trim()
  return v || null
}

export const isGroqConfigured = !!getApiKey()

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GroqJsonCompletionOptions {
  messages: GroqMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  /** Will be added to the system message to enforce JSON output. */
  jsonOnly?: boolean
}

/**
 * Request a chat completion. When `jsonOnly` is true (default for plan
 * generation), we set response_format=json_object AND prepend a strict
 * "respond with JSON only" instruction.
 */
export async function groqChat(opts: GroqJsonCompletionOptions): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('GROQ_API_KEY not configured')

  const model = opts.model || process.env.GROQ_MODEL || DEFAULT_MODEL
  const jsonOnly = opts.jsonOnly !== false // default true

  const messages: GroqMessage[] = jsonOnly
    ? [
        {
          role: 'system',
          content:
            'You output ONLY valid JSON. No prose, no markdown, no code fences. ' +
            'If the user asks something off-topic, respond with {"error":"off-topic"}.',
        },
        ...opts.messages,
      ]
    : opts.messages

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 1500,
  }
  if (jsonOnly) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Groq HTTP ${res.status}: ${txt.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq returned empty content')
  return content
}

export async function groqJson<T = unknown>(opts: GroqJsonCompletionOptions): Promise<T> {
  const txt = await groqChat({ ...opts, jsonOnly: true })
  try {
    return JSON.parse(txt) as T
  } catch (e) {
    throw new Error(`Groq returned non-JSON: ${txt.slice(0, 200)}`)
  }
}
