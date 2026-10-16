import {getListResSwaggerSchema, getResSwaggerSchema} from '../../daos/swaggerSchema/responseHandler.js'
import {genPPT, genPPTSyllabus, getIdeologyContent} from '../../services/core/llm.js'
import {genPPTDirect} from '../../services/core/llmDirect.js'
import {createGenerationTrace} from '../../services/core/traceRecorder.js'
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
        const trace = createGenerationTrace({subject: request.reqParams.subject, source: 'editor-wizard', operator: request.userInfo})
        trace.onTrace && trace.onTrace({event: 'syllabus_start', subject: request.reqParams.subject})
        let ret = await genPPTSyllabus(request.reqParams.subject, {...request.reqParams.options, onTrace: trace.onTrace})
        trace.onTrace && trace.onTrace({event: 'syllabus_done', outlineChars: String(ret || '').length})
        trace.finish && trace.finish(2, {stage: 'syllabus'})
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
        const trace = createGenerationTrace({subject: request.reqParams.subject, source: 'editor-wizard', operator: request.userInfo})
        const headers = {
            'Content-Type': 'text/event-stream',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': request.headers.origin,
            'X-Trace-Code': trace.agentCode || '',
            'Access-Control-Expose-Headers': 'X-Trace-Code',
        }
        stream.writeHead(200, headers)
        trace.onTrace && trace.onTrace({event: 'syllabus_start', subject: request.reqParams.subject})
        let outlineChars = 0
        await genPPTSyllabus(request.reqParams.subject, {
            ...request.reqParams.options, stream: true, onTrace: trace.onTrace, streamCallback: (content) => {
                outlineChars += content.length
                stream.write(content)
            }
        })
        trace.onTrace && trace.onTrace({event: 'syllabus_done', outlineChars})
        /*向导第二步（生成内容）会以同一 traceCode 续写，这里标记为执行中*/
        trace.finish && trace.finish(1, {stage: 'syllabus'})
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
        const options = request.reqParams.options || {}
        const trace = createGenerationTrace({traceCode: options.traceCode, subject: request.reqParams.syllabus, source: 'editor-wizard', operator: request.userInfo})
        trace.onTrace && trace.onTrace({event: 'ppt_start', syllabusChars: String(request.reqParams.syllabus || '').length, tmplCode: options.tmplCode, style: options.style})
        let ret = await genPPT(request.reqParams.syllabus, {...options, onTrace: trace.onTrace})
        trace.onTrace && trace.onTrace({event: 'ppt_done', contentChars: String(ret || '').length})
        trace.finish && trace.finish(2, {stage: 'content', tmplCode: options.tmplCode || 'template'})
        /*console.log(ret)*/
        return {content: ret, traceCode: trace.agentCode || undefined}
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
        const options = request.reqParams.options || {}
        const trace = createGenerationTrace({traceCode: options.traceCode, subject: request.reqParams.syllabus, source: 'editor-wizard', operator: request.userInfo})
        const headers = {
            'Content-Type': 'text/event-stream',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': request.headers.origin,
            'X-Trace-Code': trace.agentCode || '',
            'Access-Control-Expose-Headers': 'X-Trace-Code',
        }
        stream.writeHead(200, headers)
        trace.onTrace && trace.onTrace({event: 'ppt_start', syllabusChars: String(request.reqParams.syllabus || '').length, tmplCode: options.tmplCode, style: options.style})
        let lines = 0
        await genPPT(request.reqParams.syllabus, {
            ...options, stream: true, onTrace: trace.onTrace, streamCallback: (content) => {
                lines += (content.match(/\n/g) || []).length
                stream.write(content)
            }
        })
        trace.onTrace && trace.onTrace({event: 'ppt_done', lines})
        trace.finish && trace.finish(2, {stage: 'content', tmplCode: options.tmplCode || 'template', lines})
        stream.end()
        return reply
    })

    fastify.post('/gen-ppt-direct', {
        schema: {
            description: 'AI直出模式：根据主题或材料直接生成符合pptist规范的最终课件数据（不套模板）',
            summary: '直出模式生成课件',
            body: {
                type: 'object',
                properties: {
                    subject: {type: 'string', description: '主题'},
                    options: {
                        type: 'object',
                        properties: {
                            language: {type: 'string', description: '语言'},
                            fileInfo: {type: 'object', description: '上传的文本材料信息'},
                            model: {type: 'string', description: '指定模型（可选）'},
                        }
                    }
                }
            },
            tags: ['llm'],
            response: {
                default: {...getDefaultResponseSchema({content: {type: 'object', description: '课件数据{title,theme,slides,viewportSize,viewportRatio}'}})}
            }
        },
    }, async function (request, reply) {
        const trace = createGenerationTrace({subject: request.reqParams.subject, source: 'editor-direct', operator: request.userInfo})
        try {
            let ret = await genPPTDirect(request.reqParams.subject, {
                ...request.reqParams.options,
                operator: request.userInfo,
                onTrace: trace.onTrace,
                traceCode: trace.agentCode || undefined,
            })
            trace.finish && trace.finish(2, {title: ret?.title, slides: ret?.slides?.length})
            return {...ret, traceCode: trace.agentCode || undefined}
        } catch (e) {
            await (trace.finish && trace.finish(3, {error: String(e.message || e).substring(0, 200)}))
            throw e
        }
    })

    fastify.post('/gen-ppt-direct/stream', {
        schema: {
            description: 'AI直出模式：以JSONL流式返回最终课件数据，行协议：{kind:stage|meta|slide|done|error}',
            summary: '直出模式生成课件（流式）',
            body: {
                type: 'object',
                properties: {
                    subject: {type: 'string', description: '主题'},
                    options: {
                        type: 'object',
                        properties: {
                            language: {type: 'string', description: '语言'},
                            fileInfo: {type: 'object', description: '上传的文本材料信息'},
                            model: {type: 'string', description: '指定模型（可选）'},
                        }
                    }
                }
            },
            tags: ['llm']
        },
    }, async function (request, reply) {
        const stream = reply.raw
        const trace = createGenerationTrace({subject: request.reqParams.subject, source: 'editor-direct', operator: request.userInfo})
        const headers = {
            'Content-Type': 'text/event-stream',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': request.headers.origin || '*',
            'X-Trace-Code': trace.agentCode || '',
            'Access-Control-Expose-Headers': 'X-Trace-Code',
        }
        stream.writeHead(200, headers)
        /*客户端断开后停止写入，避免异常风暴*/
        let streamAlive = true
        request.raw.on('close', () => {
            streamAlive = false
        })
        /*SSE心跳：等待LLM/渲染的静默期保持连接，防止nginx等代理按read_timeout掐断HTTP/2流*/
        const heartbeat = setInterval(() => {
            if (!streamAlive) {
                clearInterval(heartbeat)
                return
            }
            try {
                stream.write(': ping\n\n')
            } catch (e) { /* ignore */ }
        }, 15000)
        try {
            await genPPTDirect(request.reqParams.subject, {
                ...request.reqParams.options, operator: request.userInfo, stream: true, onTrace: trace.onTrace, traceCode: trace.agentCode || undefined, streamCallback: (content) => {
                    if (streamAlive) {
                        try {
                            stream.write(content)
                        } catch (e) { /* ignore */ }
                    }
                }
            })
            trace.finish && trace.finish(2, {})
        } catch (e) {
            trace.finish && trace.finish(3, {error: String(e.message || e).substring(0, 200)})
            if (streamAlive) {
                stream.write(`${JSON.stringify({kind: 'error', message: e.message || 'AI直出生成失败'})}\n\n`)
            }
        }
        clearInterval(heartbeat)
        stream.end()
        return reply
    })
}
