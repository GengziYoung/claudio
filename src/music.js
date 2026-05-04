import ncmApi from 'NeteaseCloudMusicApi'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { search, song_url, lyric } = ncmApi
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 启动时加载服务器全局登录 cookie（若存在）
let savedCookie = ''
try {
  const data = JSON.parse(await readFile(join(root, 'user/cookies.json'), 'utf-8'))
  savedCookie = data.cookie || ''
  if (savedCookie) console.log('✓ 已加载登录 cookie，将以账号身份获取播放链接')
} catch {
  if (process.env.NETEASE_COOKIE) {
    savedCookie = process.env.NETEASE_COOKIE
    console.log('✓ 已从环境变量加载登录 cookie')
  } else {
    console.log('  未找到 cookie，以游客模式获取播放链接（部分歌曲只有 30s）')
  }
}

export function reloadCookie(cookie) {
  savedCookie = cookie
  console.log('✓ 已更新登录 cookie')
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

export async function getSongUrl(id, userCookie) {
  const cookie = userCookie || savedCookie
  const params = { id, br: 320000 }
  if (cookie) params.cookie = cookie
  const res = await song_url(params)
  return res.body.data?.[0]?.url || null
}

export async function getLyric(id) {
  const res = await lyric({ id })
  return res.body.lrc?.lyric || ''
}

export async function getUserTaste(cookie) {
  const lines = ['# 用户音乐品味（从网易云实时导入）\n']

  // 获取用户 UID
  let uid
  try {
    const accountRes = await ncmApi.user_account({ cookie })
    uid = accountRes.body.account?.id
  } catch {}
  if (!uid) throw new Error('获取用户信息失败，请重新登录')

  // 本周常听
  try {
    const recordRes = await ncmApi.user_record({ uid, type: 1, cookie })
    const weekly = recordRes.body.weekData?.slice(0, 20) || []
    if (weekly.length) {
      lines.push('## 本周常听（按播放次数）')
      weekly.forEach(item => {
        const s = item.song
        const artists = s.ar?.map(a => a.name).join(' / ') || '未知'
        lines.push(`- ${s.name} — ${artists}（${item.playCount}次）`)
      })
      lines.push('')
    }
  } catch {}

  // 喜欢的音乐歌单（第一个歌单通常是"我喜欢的音乐"）
  try {
    const plRes = await ncmApi.user_playlist({ uid, cookie, limit: 20 })
    const playlists = plRes.body.playlist || []
    const myLists = playlists.filter(p => p.userId === uid)

    // 喜欢的歌曲
    const liked = myLists[0]
    if (liked) {
      const tracksRes = await ncmApi.playlist_track_all({ id: liked.id, cookie, limit: 50 })
      const songs = tracksRes.body.songs?.slice(0, 50) || []
      if (songs.length) {
        lines.push('## 最近收藏的歌曲')
        songs.forEach(s => {
          const artists = s.ar?.map(a => a.name).join(' / ') || '未知'
          lines.push(`- ${s.name} — ${artists}`)
        })
        lines.push('')
      }
    }

    // 其他歌单名称
    const otherLists = myLists.slice(1, 6)
    if (otherLists.length) {
      lines.push('## 我的歌单')
      otherLists.forEach(p => lines.push(`- ${p.name}`))
    }
  } catch {}

  return lines.join('\n')
}
