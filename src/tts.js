import { createWriteStream, mkdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'public/tts')
mkdirSync(cacheDir, { recursive: true })

const cfg = JSON.parse(await readFile(join(root, 'user/fish-config.json'), 'utf-8'))

async function synthMinimax(text) {
  const mm = cfg.minimax
  const res = await fetch(
    `https://api.minimax.chat/v1/t2a_v2?GroupId=${mm.groupId}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Authorization': `Bearer ${mm.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'speech-01-turbo',
        text,
        stream: false,
        voice_setting: {
          voice_id: mm.voiceId,
          speed: 1,
          vol: 1,
          pitch: 0
        },
        audio_setting: {
          audio_sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1
        }
      })
    }
  )
  if (!res.ok) throw new Error(`MiniMax ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  if (json.base_resp?.status_code !== 0) throw new Error(`MiniMax 错误: ${json.base_resp?.status_msg}`)
  const hex = json.data?.audio
  if (!hex) throw new Error('MiniMax 返回空音频')
  return Buffer.from(hex, 'hex')
}

async function synthFish(text) {
  const fish = cfg.fish
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Authorization': `Bearer ${fish.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text, reference_id: fish.voiceId, format: 'mp3' })
  })
  if (!res.ok) throw new Error(`Fish Audio ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return Buffer.from(await res.arrayBuffer())
}

async function synthElevenlabs(text) {
  const el = cfg.elevenlabs
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${el.voiceId}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'xi-api-key': el.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }
      })
    }
  )
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return Buffer.from(await res.arrayBuffer())
}

async function synthEdge(text) {
  const voice = cfg.edge?.voiceId ?? 'zh-CN-XiaoxiaoNeural'
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = await tts.toStream(text)
  const chunks = []
  for await (const chunk of audioStream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const synths = { minimax: synthMinimax, fish: synthFish, elevenlabs: synthElevenlabs, edge: synthEdge }

export async function synthesize(text) {
  if (!text?.trim()) return null

  const hash = createHash('md5').update(text).digest('hex').slice(0, 12)
  const filename = `${hash}.mp3`
  const filepath = join(cacheDir, filename)
  const urlPath = `/tts/${filename}`

  try {
    const { statSync } = await import('fs')
    if (statSync(filepath).size > 0) return urlPath
  } catch {}

  const provider = cfg.provider ?? 'minimax'
  const synth = synths[provider]
  if (!synth) throw new Error(`未知 TTS 提供商: ${provider}`)

  const buf = await synth(text)
  if (!buf.length) throw new Error(`${provider} 返回空数据`)

  await new Promise((resolve, reject) => {
    const w = createWriteStream(filepath)
    w.write(buf)
    w.end()
    w.on('finish', resolve)
    w.on('error', reject)
  })

  return urlPath
}
