/**
 * @fileOverview 智能体任务的创建等rpc接口调用
 * @author xianyang
 * @module
 */
import grpc from '@grpc/grpc-js'
import {loadProto} from '../utils.js'

const llmApiConfig = pptonline.config.llmApiConfig

// Protocol Buffers文件
const protoPath = 'grpc/clients/agentController.proto'
const llmProto = loadProto(protoPath).llm

export async function addAgentTask(agentTaskInfo = {}) {
    let client = new llmProto.AgentController(llmApiConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': llmApiConfig.maxMessageLength,
            'grpc.max_receive_message_length': llmApiConfig.maxMessageLength,
        })
    return new Promise((resolve, reject) => {
        /*调用远程服务方法*/
        client.addAgentTask({agentTaskInfo: JSON.stringify(agentTaskInfo)}, function (err, response) {
            if (err) {
                return reject(err)
            }
            /*console.log('grpc ret:', response);*/
            return resolve(response.count)
        })
    })
}

export async function triggerAgentTask(agentCode) {
    let client = new llmProto.AgentController(llmApiConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': llmApiConfig.maxMessageLength,
            'grpc.max_receive_message_length': llmApiConfig.maxMessageLength,
        })
    return new Promise((resolve, reject) => {
        /*调用远程服务方法*/
        client.triggerAgentTask({agentCode}, function (err, response) {
            if (err) {
                return reject(err)
            }
            /*console.log('grpc ret:', response);*/
            return resolve(response)
        })
    })
}

/**
 * @description 添加一条智能体执行日志
 * @param {Object} logInfo {agentCode, agentCodePath, content, group, extInfo, operator}
 */
export async function addAgentLog(logInfo = {}) {
    let client = new llmProto.AgentController(llmApiConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': llmApiConfig.maxMessageLength,
            'grpc.max_receive_message_length': llmApiConfig.maxMessageLength,
        })
    return new Promise((resolve, reject) => {
        client.addAgentLog({
            agentCode: logInfo.agentCode || '',
            agentCodePath: logInfo.agentCodePath || [],
            content: logInfo.content || '',
            group: logInfo.group || 'common',
            extInfo: logInfo.extInfo ? JSON.stringify(logInfo.extInfo) : '',
            operator: logInfo.operator ? JSON.stringify(logInfo.operator) : '',
        }, function (err, response) {
            if (err) {
                return reject(err)
            }
            return resolve(response.count)
        })
    })
}

/**
 * @description 更新智能体任务字段（状态、返回结果等）
 * @param {String} agentCode 任务标识
 * @param {Object} toUpdateInfo 待更新字段
 */
export async function updateAgentTask(agentCode, toUpdateInfo = {}) {
    let client = new llmProto.AgentController(llmApiConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': llmApiConfig.maxMessageLength,
            'grpc.max_receive_message_length': llmApiConfig.maxMessageLength,
        })
    return new Promise((resolve, reject) => {
        client.updateAgentTask({agentCode, toUpdateInfo: JSON.stringify(toUpdateInfo)}, function (err, response) {
            if (err) {
                return reject(err)
            }
            return resolve(response.count)
        })
    })
}