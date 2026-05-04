import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import ncmApi from 'NeteaseCloudMusicApi'
const { login_qr_key, login_qr_create, login_qr_check } = ncmApi
import { searchSongs, getSongUrl, getLyric, reloadCookie } from './music.js'
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

// ── 网易云扫码登录 ──────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>网易云登录</title>
<style>body{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}
img{border-radius:12px}#cookie{word-break:break-all;font-size:11px;color:#aaa;margin-top:16px;padding:12px;background:#222;border-radius:8px;display:none}</style>
</head><body>
<h2>🎵 网易云扫码登录</h2>
<div id="qr"><p>生成中...</p></div>
<p id="status">等待扫描...</p>
<pre id="cookie"></pre>
<script>
let key
async function init() {
  document.getElementById('status').textContent = '生成二维码...'
  const r = await fetch('/admin/qr/new')
  const d = await r.json()
  key = d.key
  document.getElementById('qr').innerHTML = '<img src="' + d.img + '" width="200">'
  document.getElementById('status').textContent = '请用网易云 App 扫码'
  poll()
}
async function poll() {
  const r = await fetch('/admin/qr/check?key=' + key)
  const d = await r.json()
  document.getElementById('status').textContent = d.message
  if (d.code === 803) {
    const el = document.getElementById('cookie')
    el.style.display = 'block'
    el.textContent = '登录成功！\\n\\n请复制以下内容，添加到 Railway Variables 中\\n名称：NETEASE_COOKIE\\n值：\\n' + d.cookie
    return
  }
  if (d.code === 800) { init(); return; }
  setTimeout(poll, 2000)
}
init()
</script></body></html>`)
})

app.get('/admin/qr/new', async (req, res) => {
  try {
    const keyRes = await login_qr_key({ timestamp: Date.now() })
    const key = keyRes.body.data.unikey
    const qrRes = await login_qr_create({ key, qrimg: true, timestamp: Date.now() })
    res.json({ key, img: qrRes.body.data.qrimg })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/admin/qr/check', async (req, res) => {
  try {
    const { key } = req.query
    const checkRes = await login_qr_check({ key, timestamp: Date.now() })
    const code = checkRes.body.code
    const messages = { 800: '二维码已过期，重新生成中...', 801: '等待扫描...', 802: '已扫描，请在手机上确认' , 803: '✓ 登录成功！' }
    if (code === 803) {
      const cookie = checkRes.body.cookie
      await mkdir(join(__dirname, '../user'), { recursive: true })
      await writeFile(join(__dirname, '../user/cookies.json'), JSON.stringify({ cookie }, null, 2))
      reloadCookie(cookie)
    }
    res.json({ code, message: messages[code] || '处理中...', cookie: code === 803 ? checkRes.body.cookie : undefined })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'now', ...state.getNowPlaying() }))
})

const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`✓ Claudio 已启动 → http://localhost:${PORT}`)
})
