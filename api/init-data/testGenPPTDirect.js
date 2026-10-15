/**
 * @fileOverview AI直出模式联调测试脚本：node init-data/testGenPPTDirect.js [主题] [模型] [granularity:page|chapter]
 * @author xianyang
 * @module
 */

import '../init.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {genPPTDirect} from '../services/core/llmDirect.js'

const subject = process.argv[2] || '大学生职业生涯规划'
const modelArg = process.argv[3]
const model = !modelArg || modelArg === '-' ? undefined : modelArg
const granularity = process.argv[4] || undefined
const outFile = path.join(os.tmpdir(), `gen-ppt-direct-${granularity || 'page'}-${Date.now()}.jsonl`)
const writeStream = fs.createWriteStream(outFile)

console.log(`主题：${subject}`)
console.log(`粒度：${granularity || 'default'} | 流式输出文件：${outFile}`)

const t0 = Date.now()
try {
    await genPPTDirect(subject, {
        language: '中文',
        model,
        granularity,
        stream: true,
        streamCallback: (content) => {
            writeStream.write(content)
            for (const line of content.split(/\n+/)) {
                if (!line.trim()) continue
                try {
                    const obj = JSON.parse(line)
                    if (obj.kind === 'stage' && obj.stage === 'slide') {
                        process.stdout.write('.')
                    } else if (obj.kind === 'meta') {
                        console.log(`\n[meta] 《${obj.title}》 共${obj.total}页 genre=${obj.design?.genre} 主题色:${obj.theme.themeColors.join(' ')}`)
                    } else if (obj.kind === 'done') {
                        console.log(`\n[done] ${JSON.stringify(obj.stats)}`)
                    }
                } catch (e) { /* 非完整行忽略 */
                }
            }
        },
    })
} catch (e) {
    console.error('生成失败：', e.stack || e)
}
writeStream.end()

/*结果体检：重放解析每一行*/
const all = fs.readFileSync(outFile, 'utf-8').split(/\n+/).filter(Boolean)
let meta = null
const slides = []
for (const line of all) {
    let obj
    try {
        obj = JSON.parse(line)
    } catch (e) {
        console.log(`!! 无法解析的行: ${line.substring(0, 80)}`)
        continue
    }
    if (obj.kind === 'meta') meta = obj
    if (obj.kind === 'slide') slides.push(obj)
}
console.log(`\nslide行数: ${slides.length}/${meta?.total}, 耗时: ${Math.round((Date.now() - t0) / 1000)}s`)

const countType = (t) => slides.reduce((acc, s) => acc + s.data.elements.filter(e => e.type === t).length, 0)
const latex = countType('latex')
const photo = slides.reduce((acc, s) => acc + s.data.elements.filter(e => e.type === 'image').length, 0)
const chart = countType('chart')
const video = countType('video')
const videoNoSrc = slides.flatMap(s => s.data.elements).filter(e => e.type === 'video' && !e.src).length
const anim = slides.reduce((acc, s) => acc + ((s.data.animations || []).length), 0)
const animSlides = slides.filter(s => s.data.animations?.length).length
console.log(`元素统计: latex公式=${latex}, 照片image=${photo}, 图表=${chart}, 演示视频=${video}(空src:${videoNoSrc}), 动画元素=${anim}（覆盖${animSlides}页）`)
const latexBad = slides.flatMap(s => s.data.elements.filter(e => e.type === 'latex' && (!e.path || !e.viewBox)))
console.log(`latex缺path/viewBox: ${latexBad.length}`)
/*版式丰富度：按元素位置签名看相似度*/
const sig = (s) => s.data.elements.map(e => `${Math.round(e.left / 50)}:${Math.round(e.top / 50)}`).sort().join('|')
const sigs = slides.map(s => sig(s))
const uniq = new Set(sigs).size
console.log(`页面布局签名去重: ${uniq}/${sigs.length}（越接近1说明版式越重复）`)
const gradient = slides.filter(s => s.data.background?.type === 'gradient').length
console.log(`渐变背景页: ${gradient}`)
console.log(`输出文件: ${outFile}`)
