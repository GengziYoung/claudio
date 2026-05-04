import ncmApi from 'NeteaseCloudMusicApi'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { search, song_url, lyric } = ncmApi
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 启动时加载登录 cookie（若存在）
let savedCookie = ''
try {
  const data = JSON.parse(await readFile(join(root, 'user/cookies.json'), 'utf-8'))
  savedCookie = data.cookie || ''
  if (savedCookie) console.log('✓ 已加载登录 cookie，将以账号身份获取播放链接')
} catch {
  console.log('  未找到 cookie，以游客模式获取播放链接（部分歌曲只有 30s）')
}

export async function searchSongs(keyword, limit = 8) {
  const res = await search({ keywords: keyword, limit })
  const songs = res.body.result?.songs || []
  return songs.map(s => ({
    id: s.id,
    name: s.name,
    artist: s.artists?.map(a => a.name).join(' / ') || '未知歌手',
    album: s.album?.name || ''
  }))
}

export async function getSongUrl(id) {
  const params = { id, br: 320000 }
  if (savedCookie) params.cookie = savedCookie
  const res = await song_url(params)
  return res.body.data?.[0]?.url || null
}

export async function getLyric(id) {
  const res = await lyric({ id })
  return res.body.lrc?.lyric || ''
}
