// 用法：node scripts/login.js <手机号> <密码>
// 示例：node scripts/login.js 13800138000 mypassword
// 运行一次即可，cookie 会保存到 user/cookies.json

import ncmApi from 'NeteaseCloudMusicApi'
import { writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { login_cellphone, login_status } = ncmApi

const phone    = process.argv[2]
const password = process.argv[3]

if (!phone || !password) {
  console.error('用法：node scripts/login.js <手机号> <密码>')
  process.exit(1)
}

console.log(`正在登录 ${phone}...`)

const md5pwd = createHash('md5').update(password).digest('hex')

const res = await login_cellphone({ phone, md5_password: md5pwd })

if (res.body.code !== 200) {
  console.error('登录失败：', res.body.message || res.body.code)
  process.exit(1)
}

const cookie = res.body.cookie
const profile = res.body.profile

const outPath = join(dirname(fileURLToPath(import.meta.url)), '../user/cookies.json')
await writeFile(outPath, JSON.stringify({ cookie, uid: profile.userId }, null, 2), 'utf-8')

console.log(`✓ 登录成功：${profile.nickname}（ID: ${profile.userId}）`)
console.log(`  Cookie 已保存到 user/cookies.json`)
console.log(`  重启服务器后生效`)
