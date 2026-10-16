import {createEmptyPpt, copyPpt, importPptxFromUrl} from '../../services/core/pptInfo.js'
import {loadProto} from '../utils.js'
import {getAgentTaskForPPT} from '../../services/core/llm.js'
import {getAgentTaskForPPTDirect} from '../../services/core/llmDirect.js'

const protoPath = 'grpc/servers/pptInfo.proto'
const pptonlineProto = loadProto(protoPath).pptonline

export function initService(server) {
    server.addService(pptonlineProto.PptInfo.service, {
        createEmptyPpt: async (call, callback) => {
            try {
                let info = await createEmptyPpt(call.request.userInfo, call.request.title, call.request.externalSource)
                callback(null, info)
            } catch (e) {
                callback(e)
            }
        },
        copyPptList: async (call, callback) => {
            try {
                let list = await copyPpt(call.request.userInfo, call.request.pptCodes, call.request.externalSource)
                callback(null, {list})
            } catch (e) {
                callback(e)
            }
        },
        importPptx: async (call, callback) => {
            try {
                let info = await importPptxFromUrl(call.request.userInfo, call.request.fileUrl, {
                    title: call.request.title,
                    externalSource: call.request.externalSource
                })
                callback(null, info)
            } catch (e) {
                callback(e)
            }
        },
        getAIPPTAgentTask: async (call, callback) => {
            try {
                let options = {}
                if (call.request.options) {
                    options = JSON.parse(call.request.options)
                }
                let agentTaskInfo = options.mode === 'wizard'
                    ? await getAgentTaskForPPT(call.request.subject, options)
                    : await getAgentTaskForPPTDirect(call.request.subject, options)
                callback(null, {agentTaskInfo: JSON.stringify(agentTaskInfo)})
            } catch (e) {
                callback(e)
            }
        }
    })
    return server
}