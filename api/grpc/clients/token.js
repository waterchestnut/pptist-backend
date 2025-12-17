/**
 * @fileOverview token的rpc接口调用
 * @author xianyang
 * @module
 */
import grpc from '@grpc/grpc-js'
import {loadProto} from '../utils.js'

const ucenterConfig = pptonline.config.ucenterConfig

// Protocol Buffers文件
const protoPath = 'grpc/clients/token.proto'
const ucenterProto = loadProto(protoPath).ucenter

export async function addAccessToken(userCode, expiresTime, extInfo = {}) {
    let client = new ucenterProto.Token(ucenterConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': ucenterConfig.maxMessageLength,
            'grpc.max_receive_message_length': ucenterConfig.maxMessageLength,
        })
    return new Promise((resolve, reject) => {
        /*调用远程服务方法*/
        client.addAccessToken({userCode, expiresTime, extInfo: JSON.stringify(extInfo)}, function (err, response) {
            if (err) {
                return reject(err)
            }
            /*console.log('grpc ret:', response);*/
            return resolve(response)
        })
    })
}