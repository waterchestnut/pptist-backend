/**
 * @fileOverview AI直出模式联调测试脚本：node init-data/testGenPPTDirect.js [主题]
 * @author xianyang
 * @module
 */

import '../init.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {genPPTDirect} from '../services/core/llmDirect.js'

const subject = process.argv[2] || '大学生职业生涯规划'
const model = process.argv[3] || undefined
const outFile = path.join(os.tmpdir(), `gen-ppt-direct-${Date.now()}.jsonl`)
const writeStream = fs.createWriteStream(outFile)
let currentSlide = null

console.log(`主题：${subject}`)
console.log(`流式输出文件：${outFile}`)

const t0 = Date.now()
try {
    await genPPTDirect(subject, {
        language: '中文',
        model,
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
                        console.log(`\n[meta] 《${obj.title}》 共${obj.total}页 主题色:${obj.theme.themeColors.join(' ')}`)
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

/*结果体检：重放解析每一行，统计版式与lint*/
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
console.log(`\n行数: ${all.length}, slide行: ${slides.length}, 耗时: ${Math.round((Date.now() - t0) / 1000)}s`)
let imageCount = 0, emptySrc = 0, chartCount = 0
for (const s of slides) {
    for (const el of s.data.elements) {
        if (el.type === 'image') {
            imageCount++
            if (!el.src || !/^https?:/.test(el.src)) emptySrc++
        }
        if (el.type === 'chart') chartCount++
    }
}
console.log(`图片元素: ${imageCount}（无src: ${emptySrc}）, 图表元素: ${chartCount}`)
const layoutOf = (i) => slides[i]?.data?.elements?.length
console.log('每页元素数:', slides.map((s, i) => `${i + 1}:${layoutOf(i)}`).join(' '))
