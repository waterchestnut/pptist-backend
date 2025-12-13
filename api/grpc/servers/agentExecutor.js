/**
 * @fileOverview 智能体任务执行相关的rpc服务
 * @author xianyang
 * @pageConfig
 */

import {loadProto} from '../utils.js'
import {localExecAgentTask} from '../../services/agent/index.js'
// Protocol Buffers文件
const protoPath = 'grpc/servers/agentExecutor.proto'
const llmProto = loadProto(protoPath).llm

/**
 * 初始化rpc服务方法
 */
export function initService(server) {
    server.addService(llmProto.AgentExecutor.service, {
        execAgentTask: async (call) => {
            try {
                /*console.log(call.request.agentTaskInfo)*/
                let agentTaskInfo = JSON.parse(call.request.agentTaskInfo)
                await localExecAgentTask(agentTaskInfo, call)
                /*call.write({
                    handleStatus: 1,
                    logContent: '',
                    logGroup: '',
                    handleRet: '{msg:""}',
                    logExt: ''
                })*/
            } catch (e) {
                call.write({
                    handleStatus: -1,
                    logContent: e.message || e,
                    logGroup: 'error',
                    handleRet: '{msg:""}',
                    logExt: ''
                })
            } finally {
                call.end()
            }
        },
    })

    return server
}