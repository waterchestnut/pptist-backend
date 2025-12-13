/**
 * @fileOverview 我的课件相关的接口
 * @author xianyang 2025/7/4
 * @module
 */

import * as pptInfoService from '../../services/core/pptInfo.js'
import {registerCommonRoutes} from '../ppt/ipmi.js'
import {getPageListResSwaggerSchema} from '../../daos/swaggerSchema/responseHandler.js'

export const autoPrefix = '/ppt-my'

export default async function (fastify, opts) {
    const pptInfoSchema = {$ref: 'fullParamModels#/properties/PptInfo'}

    fastify.post('/list', {
        schema: {
            description: '获取我创建的课件列表',
            summary: '课件列表',
            body: {
                type: 'object',
                properties: {
                    filter: {type: 'object'},
                    pageIndex: {type: 'number'},
                    pageSize: {type: 'number'},
                    options: {
                        type: 'object',
                        properties: {
                            total: {type: 'number', description: '已知总数'},
                            sort: {
                                type: 'object',
                                description: '1:正序，-1：倒序',
                                additionalProperties: {type: 'number', enum: [1, -1]}
                            },
                        }
                    }
                }
            },
            tags: ['ppt-my'],
            response: {}
        }
    }, async function (request, reply) {
        return await pptInfoService.getPptInfos({
            ...request.reqParams.filter,
            operatorUserCode: request.userInfo.userCode
        }, request.reqParams.pageIndex, request.reqParams.pageSize, request.reqParams.options)
    })

    registerCommonRoutes(fastify, opts, ['ppt-my'])
}
