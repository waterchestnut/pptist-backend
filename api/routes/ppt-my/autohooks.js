/**
 * @fileOverview 检查请求中是否包含有效pptCode，以及该课件是否为当前登录用户所创建
 * @author xianyang
 * @module
 */

import {getPptInfo} from '../../services/core/pptInfo.js'

const tools = pptonline.tools
const logger = pptonline.logger

export default async function (fastify, opts) {
    fastify.addHook('preValidation', async (request, reply) => {
        /*console.log(request.hostname, request.routeOptions)*/
        if (request.routeOptions.url?.startsWith('/ppt-my/list')) {
            /*我的课件列表跳过校验*/
            return
        }

        let pptCode = request.reqParams?.pptCode
        if (!pptCode) {
            throw new Error('课件不存在')
        }
        let pptInfo = await getPptInfo(pptCode)
        if (pptInfo?.operator?.userCode !== request.userInfo?.userCode) {
            throw new Error('课件不存在')
        }
        request.pptInfo = pptInfo
    })
}
