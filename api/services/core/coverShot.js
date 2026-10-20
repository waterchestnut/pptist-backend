/**
 * @fileOverview 后端课件封面生成：Playwright 打开前端 /first-slide 路由渲染课件首页并截图，
 * 上传到文件服务（fileCode=cover-{pptCode}，与编辑器保存封面的约定一致），回写 firstSlideImgUrl/coverUrl
 * @author xianyang 2026-10-16
 * @module
 */

import {chromium} from 'playwright'
import {addAccessToken} from '../../grpc/clients/token.js'
import {saveFile} from '../../grpc/clients/fileManage.js'

const config = pptonline.config
const logger = pptonline.logger

/**
 * @description 截取课件首页图像（jpeg Buffer）
 * @param {String} pptCode 课件标识
 * @param {Object} [userInfo] 操作用户 {userCode, realName}
 * @param {Object} [options] {width=480, timeout=60000, accessToken}
 * @returns {Promise<Buffer>} 截图jpeg字节
 */
export async function capturePptCoverImage(pptCode, userInfo, options = {}) {
    const baseUrl = (config.frontendBaseUrl || config.consoleBaseUrl || '').replace(/\/+$/, '')
    if (!baseUrl) {
        throw new Error('缺少前端基地址配置(frontendBaseUrl/consoleBaseUrl)')
    }
    let accessToken = options.accessToken || ''
    if (!accessToken && options.userCode !== false) {
        try {
            const tokenInfo = await addAccessToken((userInfo && userInfo.userCode) || 'system', 10 * 60)
            accessToken = tokenInfo?.accessToken || ''
        } catch (e) {
            logger.warn(`封面截图获取token失败，尝试无token访问: ${e.message || e}`)
        }
    }
    const browser = await chromium.launch({headless: true})
    try {
        const page = await browser.newPage({
            viewport: {width: options.width || 480, height: 320},
        })
        let url = `${baseUrl}/first-slide?pptCode=${encodeURIComponent(pptCode)}`
        if (accessToken) {
            url += `&accessToken=${encodeURIComponent(accessToken)}`
        }
        await page.goto(url, {waitUntil: 'networkidle', timeout: options.timeout || 60000})
        const cover = page.locator('.slide-item')
        await cover.waitFor({state: 'visible', timeout: 30000})
        const buffer = await cover.screenshot({type: 'jpeg', quality: 85})
        return buffer
    } finally {
        await browser.close().catch(() => {
        })
    }
}

/**
 * @description 生成课件封面并上传文件服务；任何失败返回null（不抛异常，不阻塞课件主流程）
 * @param {String} pptCode 课件标识
 * @param {Object} [userInfo] 操作用户
 * @returns {Promise<Object|null>} {firstSlideImgUrl, coverUrl}
 */
export async function buildAndSavePptCover(pptCode, userInfo) {
    try {
        const buffer = await capturePptCoverImage(pptCode, userInfo)
        if (!buffer || !buffer.length) return null
        const fileCode = `cover-${pptCode}`
        await saveFile(userInfo || {userCode: 'system', realName: '系统生成'}, fileCode, {fileName: `${fileCode}.jpg`}, {}, buffer, '', 60000)
        const url = `/file/download/?fileCode=${fileCode}`
        return {firstSlideImgUrl: url, coverUrl: url}
    } catch (e) {
        logger.warn(`课件${pptCode}封面生成失败: ${e.message || e}`)
        return null
    }
}
