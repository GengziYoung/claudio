import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { searchSongs, getSongUrl, getLyric } from './music.js'
import { askClaudio } from './claude.js'
import { synthesize } from './tts.js'
import { state } from './state.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(express.json())
app.use(express.static(join(__dirname, '../public')))

function broadcast(data) {
  const msg = JSON.stringify(data)
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg)
  })
}

async function resolvePlaylist(playList) {
  const results = await Promise.all(
    playList.map(item =>
      searchSongs(`${item.name} ${item.artist}`, 1)
        .then(r => r[0] ?? null)
        .catch(() => null)
    )
  )
  return results.filter(Boolean)
}

// 获取当前状态（重启后从磁盘恢复）
app.get('/api/now', (req, res) => {
  res.json(state.getNowPlaying())
})

// 搜索歌曲
app.get('/api/search', async (req, res) => {
  const { q } = req.query
  if (!q) return res.json([])
  try {
    res.json(await searchSongs(q))
  } catch (e) {
    res.status(500).json({ error: '搜索失败' })
  }
})

// 获取播放链接
app.get('/api/song/:id/url', async (req, res) => {
  try {
    res.json({ url: await getSongUrl(req.params.id) })
  } catch (e) {
    res.status(500).json({ error: '获取链接失败' })
  }
})

// 获取歌词
app.get('/api/song/:id/lyric', async (req, res) => {
  try {
    res.json({ lyric: await getLyric(req.params.id) })
  } catch (e) {
    res.json({ lyric: '' })
  }
})

// 浏览器通知当前在播哪首
app.post('/api/now', async (req, res) => {
  const { song } = req.body
  await state.setNowPlaying({ song, status: 'playing' })
  broadcast({ type: 'now', ...state.getNowPlaying() })
  res.json({ ok: true })
})

// 聊天 — 调用 Claude，返回 DJ 回复并推送歌单
app.post('/api/chat', async (req, res) => {
  const { message } = req.body
  console.log('用户:', message)

  try {
    await state.pushHistory('user', message)

    const dj = await askClaudio(message, state.getHistory())
    console.log('Claudio:', JSON.stringify(dj))

    await state.pushHistory('assistant', dj.say)
    await state.setNowPlaying({ djSay: dj.say })

    broadcast({ type: 'dj', say: dj.say, segue: dj.segue })

    // 并行：合成语音 + 搜歌，都好了再一起推给浏览器
    ;(async () => {
      console.log('歌单长度:', dj.play?.length ?? 0)
      const [ttsUrl, songs] = await Promise.all([
        synthesize(dj.say).catch(e => { console.error('TTS 出错:', e.message, e.cause?.message ?? e.cause ?? ''); return null }),
        dj.play?.length ? resolvePlaylist(dj.play).catch(e => { console.error('搜歌出错:', e.message); return [] }) : Promise.resolve([])
      ])
      console.log('djresponse → ttsUrl:', ttsUrl, '| songs:', songs.length)
      broadcast({ type: 'djresponse', say: dj.say, ttsUrl, songs })
    })().catch(e => console.error('后台任务出错:', e.message))

    res.json({ reply: dj.say })
  } catch (e) {
    console.error('Claude 出错:', e.message)
    res.json({ reply: '思考中出了点问题，稍后再试…' })
  }
})

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'now', ...state.getNowPlaying() }))
})

const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`✓ Claudio 已启动 → http://localhost:${PORT}`)
})
