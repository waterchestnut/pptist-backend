/**
 * @fileOverview 智能体任务基础服务
 * @author xianyang 2025/9/13
 * @module
 */
import fs from 'fs'

const tools = pptonline.tools
const logger = pptonline.logger
const config = pptonline.config

/*获取智能体处理器对象*/
async function getAgentHandler(handlerName) {
    let handlerFilePath = pptonline.baseDir + 'services/agent/handler/' + handlerName + '.js'
    if (!fs.existsSync(handlerFilePath)) {
        logger.error('getAgentHandler，智能体处理器不存在：' + handlerName)
        throw new Error('智能体处理器不存在')
    }
    let Handler = (await import('./handler/' + handlerName + '.js')).default
    /*console.log(Handler)*/
    return new Handler()
}

/*执行完智能体任务项*/
export async function localExecAgentTask(agentTaskInfo, grpcCall) {
    let ret = {}
    try {
        let handler = await getAgentHandler(agentTaskInfo.params.grpcHandler)
        ret = await handler.exec(agentTaskInfo, grpcCall)
    } catch (e) {
        ret = {
            handleStatus: -1,
            handleRet: agentTaskInfo.handleRet,
            errorMsg: e.message || e,
        }
    }
    grpcCall.write(
        {
            handleStatus: ret.handleStatus,
            logContent: ret.logContent,
            logGroup: ret.logGroup,
            handleRet: JSON.stringify(ret.handleRet || {msg: ''})
        }
    )
    return ret
}