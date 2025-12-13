import {getListResSwaggerSchema, getResSwaggerSchema} from '../../daos/swaggerSchema/responseHandler.js'
import {genPPT, genPPTSyllabus, getIdeologyContent} from '../../services/core/llm.js'
import {getDefaultResponseSchema} from '../../plugins/format-reply.js'

export default async function (fastify, opts) {
    const ideologyDetailSchema = {$ref: 'fullParamModels#/properties/IdeologyDetail'}

    fastify.post('/gen-ppt-syllabus', {
        schema: {
            description: '根据主题生成PPT大纲',
            summary: '生成PPT大纲',
            body: {
                type: 'object',
                properties: {
                    subject: {type: 'string', description: '主题'},
                    options: {
                        type: 'object',
                        properties: {
                            language: {type: 'string', description: '语言'},
                            max: {type: 'number', description: '最多生成的PPT页数'},
                        }
                    }
                }
            },
            tags: ['llm'],
            response: {
                default: {...getDefaultResponseSchema({content: {type: 'string', description: 'PPT大纲'}})}
            }
        },
    }, async function (request, reply) {
        let ret = await genPPTSyllabus(request.reqParams.subject, request.reqParams.options)
        /*console.log(ret)*/
        return {content: ret}
    })

    fastify.post('/gen-ppt-syllabus/stream', {
        schema: {
            description: '根据主题生成PPT大纲，以event-stream返回',
            summary: '生成PPT大纲（流式）',
            body: {
                type: 'object',
                properties: {
                    subject: {type: 'string', description: '主题'},
                    options: {
                        type: 'object',
                        properties: {
                            language: {type: 'string', description: '语言'},
                            max: {type: 'number', description: '最多生成的PPT页数'},
                        }
                    }
                }
            },
            tags: ['llm']
        },
    }, async function (request, reply) {
        const stream = reply.raw
        const headers = {
            'Content-Type': 'text/event-stream',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': request.headers.origin
        }
        stream.writeHead(200, headers)
        await genPPTSyllabus(request.reqParams.subject, {
            ...request.reqParams.options, stream: true, streamCallback: (content) => {
                stream.write(content)
            }
        })
        stream.end()
        return reply
    })

    fastify.post('/ideology', {
        schema: {
            description: '根据主题获取课程思政摘要内容',
            summary: '获取课程思政摘要',
            body: {
                type: 'object',
                properties: {
                    subject: {type: 'string', description: '主题'},
                    options: {
                        type: 'object',
                        properties: {
                            max: {type: 'number', description: '最多获取条数'},
                        }
                    }
                }
            },
            tags: ['llm'],
            response: {
                default: {...getListResSwaggerSchema(ideologyDetailSchema)}
            }
        },
    }, async function (request, reply) {
        return await getIdeologyContent(request.reqParams.subject, request.reqParams.options)
    })

    fastify.post('/gen-ppt', {
        schema: {
            description: '根据PPT大纲生成PPist需要的PPT内容',
            summary: '生成PPT内容',
            body: {
                type: 'object',
                properties: {
                    syllabus: {type: 'string', description: 'PPT大纲'},
                    options: {
                        type: 'object',
                        properties: {
                            language: {type: 'string', description: '语言'},
                            style: {type: 'string', description: 'PPT风格'},
                        }
                    }
                }
            },
            tags: ['llm'],
            response: {
                default: {...getDefaultResponseSchema({content: {type: 'string', description: 'PPT内容'}})}
            }
        },
    }, async function (request, reply) {
        let ret = await genPPT(request.reqParams.syllabus, request.reqParams.options)
        /*console.log(ret)*/
        return {content: ret}
    })

    fastify.post('/gen-ppt/stream', {
        schema: {
            description: '根据PPT大纲生成PPist需要的PPT内容，以event-stream返回',
            summary: '生成PPT内容（流式）',
            body: {
                type: 'object',
                properties: {
                    syllabus: {type: 'string', description: 'PPT大纲'},
                    options: {
                        type: 'object',
                        properties: {
                            language: {type: 'string', description: '语言'},
                            style: {type: 'string', description: 'PPT风格'},
                        }
                    }
                }
            },
            tags: ['llm']
        },
    }, async function (request, reply) {
        const stream = reply.raw
        const headers = {
            'Content-Type': 'text/event-stream',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': request.headers.origin
        }
        stream.writeHead(200, headers)
        await genPPT(request.reqParams.syllabus, {
            ...request.reqParams.options, stream: true, streamCallback: (content) => {
                stream.write(content)
            }
        })
        stream.end()
        return reply
    })
}
