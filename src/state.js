import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(root, 'user'), { recursive: true })
const file = join(root, 'user/state.json')

const db = new Low(new JSONFile(file), {
  history: [],
  nowPlaying: { song: null, djSay: '电台已就绪', status: 'idle' }
})

await db.read()

// 确保结构完整（第一次运行时 state.json 不存在）
db.data.history   ??= []
db.data.nowPlaying ??= { song: null, djSay: '电台已就绪', status: 'idle' }
await db.write()

export const state = {
  // 对话历史
  getHistory() {
    return db.data.history
  },
  async pushHistory(role, content) {
    db.data.history.push({ role, content, ts: Date.now() })
    if (db.data.history.length > 40) db.data.history.splice(0, 2)
    await db.write()
  },

  // 当前播放状态
  getNowPlaying() {
    return db.data.nowPlaying
  },
  async setNowPlaying(patch) {
    Object.assign(db.data.nowPlaying, patch)
    await db.write()
  }
}
