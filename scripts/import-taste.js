// 用法：node scripts/import-taste.js <你的网易云用户ID>
// 示例：node scripts/import-taste.js 123456789

import ncmApi from 'NeteaseCloudMusicApi'
import { writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { user_playlist, playlist_detail } = ncmApi

const userId = process.argv[2]
if (!userId) {
  console.error('请提供用户 ID：node scripts/import-taste.js <用户ID>')
  process.exit(1)
}

console.log(`正在获取用户 ${userId} 的歌单...`)

// 获取用户所有歌单
const playlistRes = await user_playlist({ uid: userId, limit: 30 })
const playlists = playlistRes.body.playlist || []

if (!playlists.length) {
  console.error('没有找到歌单，请确认用户 ID 是否正确')
  process.exit(1)
}

// 找"我喜欢的音乐"歌单（第一个通常是）
const liked = playlists.find(p => p.name.includes('喜欢') || p.userId == userId) || playlists[0]
console.log(`找到歌单：${liked.name}（${liked.trackCount} 首）`)

// 获取歌单详情（最多取 100 首）
const detail = await playlist_detail({ id: liked.id, limit: 100 })
const tracks = detail.body.playlist?.tracks || []

// 分析歌手出现频次
const artistCount = {}
tracks.forEach(t => {
  t.ar?.forEach(a => {
    artistCount[a.name] = (artistCount[a.name] || 0) + 1
  })
})

const topArtists = Object.entries(artistCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([name, count]) => `${name}（${count} 首）`)

// 取最近 50 首歌做样本
const recentSongs = tracks.slice(0, 50).map(t => ({
  name: t.name,
  artist: t.ar?.map(a => a.name).join(' / ') || '未知'
}))

// 生成 taste.md
const md = `# 我的音乐品味（从网易云导入）

## 最常听的歌手（按收藏频次）
${topArtists.map(a => `- ${a}`).join('\n')}

## 收藏歌单：${liked.name}（共 ${liked.trackCount} 首）

### 最近收藏的 50 首
${recentSongs.map((s, i) => `${i + 1}. ${s.name} — ${s.artist}`).join('\n')}

## 听歌场景（可以手动补充）
- 早晨：轻快、有活力
- 工作：专注、轻柔
- 晚上：舒缓、有故事感

## 不喜欢的（可以手动补充）
（填你不喜欢的风格或歌手）
`

const outPath = join(dirname(fileURLToPath(import.meta.url)), '../user/taste.md')
await writeFile(outPath, md, 'utf-8')
console.log(`\n✓ 已写入 user/taste.md`)
console.log(`  ${topArtists.length} 位常听歌手，${recentSongs.length} 首收藏样本`)
console.log(`\nClaudio 现在了解你的品味了！`)
