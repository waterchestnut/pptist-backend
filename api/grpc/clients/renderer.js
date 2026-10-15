/**
 * @fileOverview 原理演示渲染相关的rpc接口调用
 * @author xianyang 2026-10-15
 * @module
 */
import grpc from '@grpc/grpc-js'
import {loadProto} from '../utils.js'

const pyServerConfig = pptonline.config.transformConfig || pptonline.config.ragPyServerConfig

// Protocol Buffers文件
const protoPath = 'grpc/clients/renderer.proto'
const ragProto = loadProto(protoPath).rag

/**
 * @description 渲染一个原理演示动画
 * @author xianyang
 * @param {String} kind 演示类型：projectile/force_analysis/lever/derivation/limit/wave/transform/reaction
 * @param {Object} [params] 演示参数（JSON对象，如 {v0:20,angleDeg:35,color:'#2563EB',steps:[...]}）
 * @param {Object} [options] 输出选项 {width, height, fps, seconds}
 * @returns {Promise<{video: Buffer, poster: Buffer, meta: Object}>} mp4字节、png封面与元数据
 */
export async function renderDemo(kind, params = {}, options = {}) {
    let client = new ragProto.Renderer(pyServerConfig.grpcHost,
        grpc.credentials.createInsecure(), {
            'grpc.max_send_message_length': pyServerConfig.maxMessageLength,
            'grpc.max_receive_message_length': pyServerConfig.maxMessageLength,
        })
    return new Promise((resolve, reject) => {
        client.renderDemo({
            kind,
            params: JSON.stringify(params || {}),
            width: options.width || 0,
            height: options.height || 0,
            fps: options.fps || 0,
            seconds: options.seconds || 0,
        }, function (err, response) {
            if (err) {
                return reject(err)
            }
            let meta = {}
            try {
                meta = JSON.parse(response.meta)
            } catch (e) { /* ignore */ }
            return resolve({video: response.video, poster: response.poster, meta})
        })
    })
}
