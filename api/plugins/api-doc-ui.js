/**
 * @fileOverview
 * @author xianyang 2024/5/27
 * @module
 */

import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import fastifyApiReference from '@scalar/fastify-api-reference'
import {getAllParamModels} from '../daos/swaggerSchema/mongooseHandler.js'

const config = pptonline.config

export default fp(async (fastify) => {
    if (!config.debug) {
        return
    }

    let tags = [
        {name: 'default', description: '默认分组的API'},
        {name: 'ppt', description: 'PPT基础API'},
        {name: 'llm', description: '大模型相关的API'},
        {name: 'ppt-ipmi', description: '课件管理相关的API'},
        {name: 'ppt-my', description: '当前用户的课件相关的API'},
        {name: 'tools', description: '代理的课件操作工具类接口'},
    ]

    fastify.register(swagger, {
        swagger: {
            info: {
                title: '在线课件服务API',
                description: '在线课件服务API端',
                version: '1.1.0'
            },
            externalDocs: {
                url: 'https://swagger.io',
                description: 'swagger官网'
            },
            host: 'localhost:12005',
            schemes: ['http', 'https'],
            consumes: ['application/json'],
            produces: ['application/json'],
            tags,
            definitions: getAllParamModels(),
            securityDefinitions: {
                accessToken: {
                    type: 'apiKey',
                    name: 'accessToken',
                    in: 'header'
                }
            }
        },
        openapi: {
            openapi: '3.0.1',
            info: {
                title: '在线课件服务',
                description: '在线课件服务端',
                version: '1.1.0'
            },
            servers: [
                {
                    url: 'http://localhost:12005',
                    description: '开发环境'
                },
                {
                    url: 'https://apisix.local/pptonline',
                    description: '测试环境'
                }
            ],
            tags,
            components: {
                securitySchemes: {
                    accessToken: {
                        type: 'apiKey',
                        name: 'accessToken',
                        in: 'header'
                    }
                },
                schemas: getAllParamModels()
            },
            externalDocs: {
                url: 'https://swagger.io',
                description: 'swagger官网'
            },
        },
        refResolver: {
            buildLocalReference(json, baseUri, fragment, i) {
                return json.$id || `def-${i}`
            }
        }
    })

    fastify.register(swaggerUI, {
        routePrefix: '/documentation',
        uiConfig: {
            docExpansion: 'full',
            deepLinking: false
        },
        uiHooks: {
            onRequest: function (request, reply, next) {
                next()
            },
            preHandler: function (request, reply, next) {
                next()
            }
        },
        staticCSP: true,
        transformStaticCSP: (header) => header,
        transformSpecification: (swaggerObject, request, reply) => {
            return swaggerObject
        },
        transformSpecificationClone: true
    })

    fastify.register(fastifyApiReference, {
        routePrefix: '/reference',
        configuration: {
            spec: {
                content: () => {
                    let json = {...fastify.swagger()}
                    delete json.tags
                    return json
                },
            },
        },
    })
})