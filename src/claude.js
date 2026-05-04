import OpenAI from 'openai'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 加载 .env
try {
  const env = await readFile(join(root, 'user/.env'), 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

const client = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL
})

async function readOptional(path) {
  try { return await readFile(path, 'utf-8') }
  catch { return '' }
}

async function buildPrompt(userMessage, history = []) {
  const persona = await readOptional(join(root, 'prompts/dj-persona.md'))
  const taste   = await readOptional(join(root, 'prompts/taste.md'))
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const historyText = history.length
    ? '\n## 最近对话\n' + history.slice(-6).map(h =>
        `${h.role === 'user' ? '用户' : 'Claudio'}: ${h.content}`
      ).join('\n')
    : ''

  return `${persona}

## 用户品味
${taste}

## 当前时间
${now}
${historyText}

## 用户说
${userMessage}

请返回 JSON：`
}

export async function askClaudio(userMessage, history = []) {
  const prompt = await buildPrompt(userMessage, history)

  const completion = await client.chat.completions.create({
    model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })

  const raw = completion.choices[0].message.content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

  try {
    return JSON.parse(raw)
  } catch {
    return { say: raw, play: [], reason: '', segue: '' }
  }
}
