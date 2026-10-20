/**
 * @fileOverview AI直出模式：直接生成pptist最终课件数据并持久化（不经过模板合成/Playwright）
 * @author xianyang 2026/10/14
 * @module
 */
import BaseHandler from './base.js'
import {genPPTDirect} from '../../core/llmDirect.js'
import {buildAndSavePptCover} from '../../core/coverShot.js'
import pptInfoDac from '../../../daos/core/dac/pptInfoDac.js'
import CreateTypeEnum from '../../../daos/core/enum/CreateTypeEnum.js'

const tools = pptonline.tools
const logger = pptonline.logger

class PPTDirectCompose extends BaseHandler {
    constructor() {
        super()
    }

    async exec(agentTaskInfo, grpcCall) {
        let params = agentTaskInfo.params || {}
        if (!params.subject) {
            return {
                handleStatus: -1,
                handleRet: null,
                logContent: '缺少主题，无法直出模式生成课件',
                logGroup: 'error',
            }
        }
        let pptObj
        const onTrace = createGrpcCallTrace(grpcCall)
        try {
            pptObj = await genPPTDirect(params.subject, {
                language: params.language,
                fileInfo: params.fileInfo,
                granularity: params.granularity,
                maxPages: params.maxPages,
                operator: params.operator,
                onTrace,
            })
        } catch (e) {
            logger.error('直出模式生成课件异常: %s', e.stack || e)
            return {
                handleStatus: -1,
                handleRet: null,
                logContent: `直出模式生成失败：${e.message || e}`,
                logGroup: 'error',
            }
        }
        if (!pptObj?.slides?.length) {
            return {
                handleStatus: -1,
                handleRet: null,
                logContent: '直出模式未生成有效课件页面',
                logGroup: 'error',
            }
        }
        let pptCode = pptObj.pptCode = params.pptCode || tools.getUUID()
        let title = pptObj.title = params.pptTitle || pptObj.title
        let operator = params.operator || {}
        delete pptObj.stats
        await pptInfoDac.upsert({
            ...pptObj,
            pptCode,
            title,
            slideIndex: 0,
            createType: CreateTypeEnum.ai.value,
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
            logContent: `PPT《${title}》直出模式生成完成（${pptObj.slides.length}页）${coverNote}`,
            logGroup: 'completed',
        }
    }
}

export default PPTDirectCompose
