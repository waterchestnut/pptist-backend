/**
 * @fileOverview 把AI生成的PPT大纲与内容合成PPT格式的JSON数据
 * @author xianyang 2025/9/8
 * @module
 */
import BaseHandler from './base.js'
import {packagePPT} from '../../console-mock/aippt.js'
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
        let pptObj = await packagePPT(JSON.parse(agentTaskInfo.parentRet.pptContent), agentTaskInfo.params?.tmplCode)
        let pptCode = pptObj.pptCode = pptObj.pptCode || agentTaskInfo.params?.pptCode || tools.getUUID()
        let title = pptObj.title = agentTaskInfo.params?.pptTitle || pptObj.title
        let operator = agentTaskInfo.params?.operator || {}
        await pptInfoDac.upsert({
            ...pptObj,
            operator: {
                userCode: operator.userCode || 'system',
                realName: operator.realName || '系统生成'
            }
        })
        return {
            handleStatus: 2,
            handleRet: {pptCode, title},
            logContent: `PPT《${title}》生成完成`,
            logGroup: 'completed',
        }
    }
}

export default PPTCompose
