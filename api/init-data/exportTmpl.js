/**
 * @fileOverview 导出PPT模版
 * @author xianyang
 * @module
 */

import '../init.js'
import pptInfoDac from '../daos/core/dac/pptInfoDac.js'
import fs from 'fs'
import path from 'path'

const tools = pptonline.tools
const baseDir = pptonline.baseDir
const fileBaseUrl = 'https://lib.lc.jtxuexi.com/ppt-tmpl/'

let userInfo = {
    userCode: 'micro',
    realName: '超级管理员',
}

/**
 * @description 拼接文件服务的绝对地址
 */
export const getDocHttpUrl = (relativeUrl) => {
    if (relativeUrl.startsWith('http')) {
        return relativeUrl
    }
    return `${pptonline.config.docConfig.baseUrl}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`
}

async function download(url, fileName, pptCode) {
    if (!url) return null
    try {
        const pptTmplDir = `${baseDir}init-data/cache/ppt-tmpl/${pptCode}/`
        if (!fs.existsSync(pptTmplDir)) {
            await fs.promises.mkdir(pptTmplDir, {recursive: true})
        }
        const filePath = path.join(pptTmplDir, fileName)
        if (fs.existsSync(filePath)) {
            return fileName
        }

        const response = await fetch(url)
        if (!response.ok) {
            console.warn(`Failed to download: ${url}`)
            return null
        }
        const buffer = await response.arrayBuffer()
        await fs.promises.writeFile(filePath, Buffer.from(buffer))
        console.log(`Downloaded: ${fileName}`)
        return fileName
    } catch (err) {
        console.warn(`Error downloading ${url}: ${err.message}`)
        return null
    }
}

async function processSlides(slides, pptCode) {
    if (!slides || !slides.length) return slides

    const slidesJson = JSON.stringify(slides)
    const urlRegex = /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|gif|webp|mp3|wav|mp4|webm|m4a|jfif)(?:\?[^\s"']*)?/gi
    const matches = [...new Set(slidesJson.match(urlRegex) || [])]

    const urlMap = {}
    for (const url of matches) {
        let baseName = path.basename(url)
        const fileName = baseName ? baseName.split('?')[0] : `${tools.getUUID()}${path.extname(url) || '.jpg'}`
        const localPath = await download(url, fileName, pptCode)
        if (localPath) {
            urlMap[url] = `${fileBaseUrl}${pptCode}/${fileName}`
        }
    }

    if (Object.keys(urlMap).length === 0) return slides

    let processedJson = slidesJson
    for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
        processedJson = processedJson.replaceAll(oldUrl, newUrl)
    }

    return JSON.parse(processedJson)
}

async function exportTmpl() {
    let all = await pptInfoDac.getTop(1000, {status: 0, pptType: ['buildInTmpl', 'platformTmpl']})
    console.log(`Total templates: ${all.length}`)
    let caches = []
    for (let i = 0; i < all.length; i++) {
        let item = all[i]
        delete item._id
        delete item.__v
        delete item.insertTime
        delete item.updateTime
        delete item.operator

        if (item.coverUrl) {
            const ext = path.extname(item.coverUrl) || '.jpg'
            const fileName = `cover-${item.pptCode}${ext}`
            const localCover = await download(getDocHttpUrl(item.coverUrl), fileName, item.pptCode)
            if (localCover) {
                item.coverUrl = `${fileBaseUrl}${item.pptCode}/${fileName}`
            }
        }

        if (item.slides) {
            item.slides = await processSlides(item.slides, item.pptCode)
        }

        caches.push(item)
    }
    await fs.promises.writeFile(`${baseDir}init-data/cache/tmpl.json`, JSON.stringify(caches, null, 2))
}

await exportTmpl()

console.log('done')