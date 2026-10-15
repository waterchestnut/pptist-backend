/**
 * @fileOverview 文件管理相关的rpc服务
 * @author xianyang
 * @pageConfig
 */

import grpc from '@grpc/grpc-js';
import {loadProto} from "../utils.js";

const docConfig = pptonline.config.docConfig;
// Protocol Buffers文件
const protoPath = 'grpc/clients/fileManage.proto'
const docProto = loadProto(protoPath).doc

export async function saveFile(curUserInfo, fileCode, fileInfo, extInfo, buffer, folder = '', timeoutMs = 0) {
    let client = new docProto.FileManage(docConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': docConfig.maxMessageLength,
            'grpc.max_receive_message_length': docConfig.maxMessageLength,
        })
    let callOptions = timeoutMs ? {deadline: new Date(Date.now() + timeoutMs)} : {}
    return new Promise((resolve, reject) => {
        /*调用远程服务方法*/
        client.saveFile({
            fileCode,
            operator: curUserInfo,
            fileInfos: JSON.stringify(fileInfo),
            extInfos: JSON.stringify(extInfo),
            buffer,
            folder
        }, new grpc.Metadata(), callOptions, function (err, response) {
            if (err) {
                return reject(err)
            }
            /*console.log('grpc ret:', response);*/
            return resolve(JSON.parse(response.fileInfos))
        })
    })
}

export async function copyFile(curUserInfo, originalFileCode, fileInfo, folder = '') {
    /*console.log(ragConfig, ragProto.RagSearch)*/
    let client = new docProto.FileManage(docConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': docConfig.maxMessageLength,
            'grpc.max_receive_message_length': docConfig.maxMessageLength,
        })
    return new Promise((resolve, reject) => {
        /*调用远程服务方法*/
        client.copyFile({
            originalFileCode,
            operator: curUserInfo,
            fileInfos: JSON.stringify(fileInfo),
            folder
        }, function (err, response) {
            if (err) {
                return reject(err)
            }
            /*console.log('grpc ret:', response);*/
            return resolve(JSON.parse(response.fileInfos))
        })
    })
}