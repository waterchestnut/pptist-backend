import {proxyImgSearch} from '../../services/core/pexels.js'
import {aiWriting, genPPTSyllabus} from '../../services/core/llm.js'

export default async function (fastify, opts) {
    fastify.post('/img_search', {schema: {tags: ['tools'],}}, async function (request, reply) {
        return proxyImgSearch(request.reqParams)
    })

    fastify.post('/ai_writing', {
        schema: {
            description: 'AI 写作',
            summary: 'AI 写作（流式）',
            body: {
                type: 'object',
                properties: {
                    command: {type: 'string', description: '指令'},
                    content: {type: 'string', description: '源内容'},
                    model: {type: 'string', description: '使用的模型'},
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
        await aiWriting(request.reqParams.command, request.reqParams.content, {
            ...request.reqParams, stream: true, streamCallback: (content) => {
                stream.write(content)
            }
        })
        stream.end()
        return reply
    })
}
