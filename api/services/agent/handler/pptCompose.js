/**
 * @fileOverview 把AI生成的PPT大纲与内容合成PPT格式的JSON数据
 * @author xianyang 2025/9/8
 * @module
 */
import BaseHandler from './base.js'
import {packagePPT} from '../../console-mock/aippt.js'
import {buildAndSavePptCover} from '../../core/coverShot.js'
import pptInfoDac from '../../../daos/core/dac/pptInfoDac.js'

const tools = pptonline.tools
const logger = pptonline.logger
const config = pptonline.config

class PPTCompose extends BaseHandler {
    constructor() {
        super()
    }

    async exec(agentTaskInfo, grpcCall) {
        if (!agentTaskInfo?.parentRet?.pptContent) {
            return {
                handleStatus: -1,
                handleRet: null,
                logContent: 'PPT内容不存，无法合成PPT',
                logGroup: 'error',
            }
        }
        let contentPages = 0
        try {
            contentPages = JSON.parse(agentTaskInfo.parentRet.pptContent).length || 0
        } catch (e) { /* ignore */ }
        try {
            grpcCall.write({
                handleStatus: 1,
                logContent: `开始Playwright模板合成：${contentPages}页内容数据，模板=${agentTaskInfo.params?.tmplCode || '默认'}`,
                logGroup: 'thinking',
                logExt: JSON.stringify({event: 'compose_start', tmplCode: agentTaskInfo.params?.tmplCode, contentPages}),
                handleRet: '',
            })
        } catch (e) { /* ignore */ }
        const t0 = Date.now()
        let pptObj = await packagePPT(JSON.parse(agentTaskInfo.parentRet.pptContent), agentTaskInfo.params?.tmplCode, agentTaskInfo.params?.operator?.userCode || 'system')
        let pptCode = pptObj.pptCode = pptObj.pptCode || agentTaskInfo.params?.pptCode || tools.getUUID()
        let title = pptObj.title = agentTaskInfo.params?.pptTitle || pptObj.title
        let operator = agentTaskInfo.params?.operator || {}
        try {
            grpcCall.write({
                handleStatus: 1,
                logContent: `模板合成完成：${pptObj.slides?.length || 0}页，耗时${((Date.now() - t0) / 1000).toFixed(1)}s，开始持久化课件`,
                logGroup: 'thinking',
                logExt: JSON.stringify({event: 'compose_done', slides: pptObj.slides?.length, ms: Date.now() - t0}),
                handleRet: '',
            })
        } catch (e) { /* ignore */ }
        await pptInfoDac.upsert({
            ...pptObj,pptCode,title,
            operator: {
                userCode: operator.userCode || 'system',
                realName: operator.realName || '系统生成'
            }
        })
        let coverNote = ''
        const coverInfo = await buildAndSavePptCover(pptCode, {
            userCode: operator.userCode || 'system',
            realName: operator.realName || '系统生成',
        })
        if (coverInfo) {
            await pptInfoDac.update({...coverInfo, pptCode})
        } else {
            coverNote = '（封面生成失败）'
        }
        return {
            handleStatus: 2,
            handleRet: {pptCode, title},
            logContent: `PPT《${title}》生成完成${coverNote}`,
            logGroup: 'completed',
        }
    }
}

export default PPTCompose
