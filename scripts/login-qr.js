// 扫码登录网易云，保存 cookie
// 用法：node scripts/login-qr.js

import ncmApi from 'NeteaseCloudMusicApi'
import { writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { login_qr_key, login_qr_create, login_qr_check } = ncmApi
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 1. 获取二维码 key
const keyRes = await login_qr_key({ timestamp: Date.now() })
const key = keyRes.body.data.unikey

// 2. 生成二维码图片（base64 PNG）
const qrRes = await login_qr_create({ key, qrimg: true, timestamp: Date.now() })
const qrImgData = qrRes.body.data.qrimg  // "data:image/png;base64,..."

// 把图片保存成文件，方便用手机扫
const base64 = qrImgData.replace('data:image/png;base64,', '')
const imgPath = join(root, 'user/login-qr.png')
await writeFile(imgPath, Buffer.from(base64, 'base64'))

console.log('╔═══════════════════════════════════════╗')
console.log('║  用网易云 App 扫描二维码完成登录      ║')
console.log('╚═══════════════════════════════════════╝')
console.log(`\n二维码图片已保存：user/login-qr.png`)
console.log('请打开这个文件，用手机网易云 App 扫码\n')
console.log('等待扫描中...')

// 3. 轮询扫码状态
const cookie = await new Promise((resolve, reject) => {
  const timer = setInterval(async () => {
    const checkRes = await login_qr_check({ key, timestamp: Date.now() })
    const code = checkRes.body.code

    if (code === 803) {
      clearInterval(timer)
      resolve(checkRes.body.cookie)
    } else if (code === 800) {
      clearInterval(timer)
      reject(new Error('二维码已过期，请重新运行脚本'))
    } else if (code === 802) {
      process.stdout.write('\r已扫描，等待确认...')
    }
  }, 2000)

  // 3 分钟超时
  setTimeout(() => {
    clearInterval(timer)
    reject(new Error('等待超时，请重新运行脚本'))
  }, 180000)
})

// 4. 保存 cookie
const outPath = join(root, 'user/cookies.json')
await writeFile(outPath, JSON.stringify({ cookie, uid: 312300720 }, null, 2), 'utf-8')

console.log('\n✓ 登录成功！Cookie 已保存到 user/cookies.json')
console.log('  重启服务器后生效（npm run dev）')
