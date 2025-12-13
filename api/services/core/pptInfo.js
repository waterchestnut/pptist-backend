/**
 * @fileOverview 课件相关的业务操作
 * @author xianyang
 * @module
 */

import pptInfoDac from '../../daos/core/dac/pptInfoDac.js'
import retSchema from '../../daos/retSchema.js'
import {importRemote} from './importPptx.js'

const tools = pptonline.tools
const logger = pptonline.logger
const config = pptonline.config

/**
 * @description 获取课件信息
 * @author xianyang
 * @param {String} pptCode 课件标识
 * @returns {Promise<Object>} 课件元数据详细信息
 */
export async function getPptInfo(pptCode) {
    return pptInfoDac.getByCode(pptCode)
}

/**
 * @description 保存自己的课件信息
 * @author xianyang
 * @param {Object} curUserInfo 当前登录用户
 * @param {Object} pptInfo 待保存的课件信息
 * @param {Boolean} skipOperatorCheck 是否跳过课件创建者的强匹配校验
 * @returns {Promise<Object>} 保存后的课件信息
 */
export async function saveMyPpt(curUserInfo, pptInfo, skipOperatorCheck = false) {
    if (pptInfo.pptCode) {
        let existPpt = await pptInfoDac.getByCode(pptInfo.pptCode)
        if (skipOperatorCheck && !existPpt) {
            throw new Error('课件不存在')
        }
        if (!skipOperatorCheck && existPpt && existPpt.operator?.userCode !== curUserInfo.userCode) {
            throw new Error('非自己的课件不能保存')
        }
    } else {
        pptInfo.pptCode = tools.getUUID()
    }

    return pptInfoDac.upsert({
        pptCode: pptInfo.pptCode,
        title: pptInfo.title,
        theme: pptInfo.theme,
        slides: pptInfo.slides,
        slideIndex: pptInfo.slideIndex,
        viewportSize: pptInfo.viewportSize,
        viewportRatio: pptInfo.viewportRatio,
        templates: pptInfo.templates,
        operator: {
            userCode: curUserInfo.userCode,
            realName: curUserInfo.realName
        },
        coverUrl: pptInfo.coverUrl,
        firstSlideImgUrl: pptInfo.firstSlideImgUrl,
        externalSource: pptInfo.externalSource,
        createType: pptInfo.createType,
        pptType: pptInfo.pptType,
        templateCode: pptInfo.templateCode,
        description: pptInfo.description,
        width: pptInfo.width,
        height: pptInfo.height,
        tags: pptInfo.tags,
        aiIndividual: pptInfo.aiIndividual
    })
}

/**
 * @description 新建空白课件
 * @param {Object} curUserInfo 用户信息
 * @param {String} title 标题
 * @param {String} [externalSource] 来源
 * @returns {Promise<Object>}
 */
export async function createEmptyPpt(curUserInfo, title = '新建空白课件', externalSource) {
    let pptInfo = {
        pptCode: tools.getUUID(),
        title,
        externalSource,
        operator: {
            userCode: curUserInfo.userCode,
            realName: curUserInfo.realName
        },
        slides: [
            {
                id: tools.getUUID().substring(0, 9),
                elements: []
            }
        ]
    }
    return pptInfoDac.add(pptInfo)
}

/**
 * @description 批量复制课件
 * @param {Object} curUserInfo 用户信息
 * @param {String[]} pptCodes 课件标识
 * @param {String} [externalSource] 来源
 * @returns {Promise<*[]>}
 */
export async function copyPpt(curUserInfo, pptCodes = [], externalSource) {
    if (!pptCodes?.length) {
        return []
    }
    let pptList = await pptInfoDac.getTop(pptCodes.length, {pptCode: pptCodes})
    if (!pptList.length) {
        return []
    }
    let newPptList = pptList.map(_ => ({
        pptCode: tools.getUUID(),
        title: _.title,
        theme: _.theme,
        slides: _.slides,
        slideIndex: _.slideIndex,
        viewportSize: _.viewportSize,
        viewportRatio: _.viewportRatio,
        templates: _.templates,
        operator: {
            userCode: curUserInfo.userCode,
            realName: curUserInfo.realName
        },
        externalSource,
        originalCode: _.pptCode
    }))
    await pptInfoDac.bulkUpdate(newPptList)
    return newPptList
}

/**
 * @description 从url链接导入pptx
 * @param {Object} userInfo 用户信息
 * @param {String} fileUrl pptx下载链接
 * @param {Object} [options]
 * @param {String} [options.title] 标题
 * @param {String} [options.externalSource] 来源
 * @returns {Promise<Object>}
 */
export async function importPptxFromUrl(userInfo, fileUrl, options = {}) {
    let pptInfo = await importRemote(fileUrl, userInfo)
    pptInfo.title = options.title || pptInfo.title
    pptInfo.externalSource = options.externalSource
    pptInfo.pptType = options.pptType
    return saveMyPpt(userInfo, pptInfo)
}

/**
 * @description 获取课件列表
 * @author xianyang
 * @param {Object} [filter] 筛选条件
 * @param {Number} [pageIndex=1] 页码
 * @param {Number} [pageSize=10] 分页大小
 * @param {Object} [options] 排序、格式化等参数
 * @param {Number} [options.total] 记录的总数（翻页时可省略总数的查询）
 * @param {{[key: string]:1 | -1}} [options.sort] 排序
 * @returns {Promise<{total: Number, rows: [Object]}>} {total: 总数, rows: 课件数组}
 */
export async function getPptInfos(filter = {}, pageIndex = 1, pageSize = 10, options = {}) {
    let optionsIn = {...filter}
    if (options.sort) {
        optionsIn.sort = options.sort
    } else {
        optionsIn.sort = {updateTime: -1}
    }
    if (options.total) {
        optionsIn.total = options.total
    }
    return pptInfoDac.getByPage(pageIndex, pageSize, optionsIn)
}

/**
 * @description 删除课件
 * @author menglb
 * @param {Object} curUserInfo 当前用户
 * @param {String} pptCode 课件标识
 * @returns {Promise<Object>} 受影响的行数
 */
export async function deletePptInfo(curUserInfo, pptCode) {
    if (!pptCode) {
        throw new Error('缺少课件标识')
    }

    return pptInfoDac.update({pptCode, status: -1})
}

/**
 * @description 启用课件
 * @author menglb
 * @param {Object} curUserInfo 当前用户
 * @param {String} pptCode 课件标识
 * @returns {Promise<Object>} 受影响的行数
 */
export async function enablePptInfo(curUserInfo, pptCode) {
    if (!pptCode) {
        throw new Error('缺少课件标识')
    }

    return pptInfoDac.update({pptCode, status: 0})
}

/**
 * @description 禁用课件
 * @author menglb
 * @param {Object} curUserInfo 当前用户
 * @param {String} pptCode 课件标识
 * @returns {Promise<Object>} 受影响的行数
 */
export async function disablePptInfo(curUserInfo, pptCode) {
    if (!pptCode) {
        throw new Error('缺少课件标识')
    }

    return pptInfoDac.update({pptCode, status: 1})
}