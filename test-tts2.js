import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { existsSync, statSync } from 'fs'

const tts = new MsEdgeTTS()
await tts.setMetadata('zh-CN-XiaomoNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

// 试 toFile 方法
console.log('测试 toFile...')
try {
  const { audioFilePath } = await tts.toFile('./test-out', '你好，今晚给你来几首好听的')
  const size = existsSync(audioFilePath) ? statSync(audioFilePath).size : 0
  console.log('toFile 结果:', audioFilePath, size, 'bytes')
} catch(e) {
  console.log('toFile 报错:', e.message)
}

// 看 toStream 返回了什么
console.log('\n测试 toStream 返回值...')
const result = await tts.toStream('你好')
console.log('keys:', Object.keys(result))
console.log('audioStream type:', result.audioStream?.constructor?.name)
