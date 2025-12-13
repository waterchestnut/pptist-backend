/**
 * @fileOverview 课件管理相关的接口
 * @author xianyang 2025/7/4
 * @module
 */

import * as pptInfoService from '../../services/core/pptInfo.js'
import {getPageListResSwaggerSchema, getResSwaggerSchema} from '../../daos/swaggerSchema/responseHandler.js'

export const autoPrefix = '/ppt/ipmi'

const pptInfoSchema = {$ref: 'fullParamModels#/properties/PptInfo'}

export function registerCommonRoutes(fastify, opts, tags = ['ppt-ipmi']) {
    fastify.get('/detail', {
        schema: {
            description: '获取课件全部信息结构',
            summary: '获取课件的详细信息',
            querystring: {
                type: 'object',
                properties: {
                    pptCode: {type: 'string'}
                },
                required: ['pptCode']
            },
            tags,
            response: {}
        }
    }, async function (request, reply) {
        return await pptInfoService.getPptInfo(request.reqParams.pptCode)
    })

    fastify.post('/update', {
        schema: {
            description: '修改单个课件',
            summary: '修改单个课件',
            body: pptInfoSchema,
            tags,
            response: {}
        }
    }, async function (request, reply) {
        return await pptInfoService.saveMyPpt(request.userInfo, {
            ...request.reqParams,
            pptCode: request.reqParams.pptCode
        }, true)
    })

    fastify.post('/delete', {
        schema: {
            description: '删除课件',
            summary: '删除课件',
            body: {
                type: 'object',
                properties: {
                    pptCode: {
                        type: 'string'
                    },
                },
                required: ['pptCode']
            },
            tags,
            response: {}
        }
    }, async function (request, reply) {
        return await pptInfoService.deletePptInfo(request.userInfo, request.reqParams.pptCode)
    })

    fastify.post('/enable', {
        schema: {
            description: '启用课件',
            summary: '启用课件',
            body: {
                type: 'object',
                properties: {
                    pptCode: {
                        type: 'string'
                    },
                },
                required: ['pptCode']
            },
            tags,
            response: {}
        }
    }, async function (request, reply) {
        return await pptInfoService.enablePptInfo(request.userInfo, request.reqParams.pptCode)
    })

    fastify.post('/disable', {
        schema: {
            description: '禁用课件',
            summary: '禁用课件',
            body: {
                type: 'object',
                properties: {
                    pptCode: {
                        type: 'string'
                    },
                },
                required: ['pptCode']
            },
            tags,
            response: {}
        }
    }, async function (request, reply) {
        return await pptInfoService.disablePptInfo(request.userInfo, request.reqParams.pptCode)
    })
}

export default async function (fastify, opts) {

    fastify.post('/list', {
        schema: {
            description: '获取课件列表',
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
            tags: ['ppt-ipmi'],
            response: {}
        }
    }, async function (request, reply) {
        return await pptInfoService.getPptInfos(request.reqParams.filter, request.reqParams.pageIndex, request.reqParams.pageSize, request.reqParams.options)
    })

    registerCommonRoutes(fastify, opts)
}