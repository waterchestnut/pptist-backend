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