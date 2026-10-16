/**
 * @fileOverview AI生成过程统一记录层：把直出/套模板/agent管线的生成过程事件，
 * 以"壳任务+执行日志"的形式写入llm.api的agentTask/agentLog存储；任何记录失败都静默降级，绝不影响生成主流程
 * @author xianyang 2026-10-16
 * @module
 */

import {addAgentTask, addAgentLog, updateAgentTask} from '../../grpc/clients/agentController.js'

const config = pptonline.config
const llmApiConfig = config.llmApiConfig || {}
const tools = pptonline.tools
const logger = pptonline.logger

const GROUP_MAP = {
    plan_start: 'thinking',
    plan_done: 'thinking',
    syllabus_start: 'thinking',
    syllabus_done: 'thinking',
    ppt_start: 'thinking',
    ppt_done: 'thinking',
    unit_done: 'thinking',
    llm_call: 'common',
    demo_render: 'common',
    done: 'completed',
    error: 'error',
}

function short(v, n = 30) {
    v = String(v ?? '')
    return v.length > n ? v.substring(0, n) + '…' : v
}

function fmtMs(ms) {
    ms = Number(ms) || 0
    return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'
}

/*事件转人读中文单行日志*/
export function humanizeEvent(ev = {}) {
    switch (ev.event) {
        case 'plan_start':
            return `开始全局设计规划：主题「${short(ev.subject)}」${ev.fileChars ? `，参考材料${ev.fileChars}字` : ''}`
        case 'plan_done':
            return `设计规划完成：《${ev.title}》共${ev.total}页，类型=${ev.genre || '通用'}，配色=${(ev.palette || []).join('/')}，耗时${fmtMs(ev.ms)}`
        case 'syllabus_start':
            return `开始生成大纲：主题「${short(ev.subject)}」${ev.fileChars ? `，参考材料${ev.fileChars}字` : ''}`
        case 'syllabus_done':
            return `大纲生成完成：${ev.outlineChars || 0}字，耗时${fmtMs(ev.ms)}`
        case 'ppt_start':
            return `开始生成PPT内容：大纲${ev.syllabusChars || 0}字，模板=${ev.tmplCode || '内置'}，风格=${ev.style || '通用'}`
        case 'ppt_done':
            return `PPT内容生成完成：${ev.lines ? `共${ev.lines}页数据行` : ''}${ev.contentChars ? `${ev.lines ? '，' : '共'}${ev.contentChars}字` : ''}，耗时${fmtMs(ev.ms)}`
        case 'llm_call':
            return `LLM调用[${ev.role || '-'}] ${ev.model || ''}：输入${ev.promptChars || 0}字 输出${ev.completionChars || 0}字 耗时${fmtMs(ev.ms)}${ev.ok ? '' : ` 失败(${short(ev.error, 120)})`}`
        case 'unit_done':
            return `生成单元完成(${ev.unit} 第${ev.from}-${ev.to}页)：LLM调用${ev.llmCalls}次，重试${ev.retries}，页级修补${ev.pageRegens}，耗时${fmtMs(ev.ms)}`
        case 'demo_render':
            return `原理演示${ev.result === 'ok' ? '渲染成功' : (ev.result === 'fallback' ? '渲染不可用，已降级为分镜面板' : '渲染失败')}: ${ev.kind || ''}，耗时${fmtMs(ev.ms)}`
        case 'done':
            return `生成完成：《${ev.title || ''}》共${ev.slides ?? '?'}页${ev.dropped ? `，丢弃${ev.dropped}页` : ''}，渲染成功${ev.renderOk ?? 0}/降级${ev.renderFallback ?? 0}/失败${ev.renderFailed ?? 0}，总耗时${fmtMs(ev.ms)}`
        case 'error':
            return `生成失败：${short(ev.message, 200)}`
        default:
            return JSON.stringify(ev)
    }
}

function normalizeOperator(operator) {
    if (operator && operator.userCode) {
        /*只保留身份字段，避免accessToken等敏感信息写入过程记录*/
        return {userCode: operator.userCode, realName: operator.realName || ''}
    }
    return {userCode: 'ai-generate', realName: 'AI生成过程'}
}

/**
 * @description 编辑器交互链路的过程记录器：创建壳任务并异步逐条写日志
 * @param {Object} info {title?, subject, source('editor-direct'|'editor-wizard'), operator?, traceCode?}
 * @returns {{agentCode: (String|null), onTrace: (Function|null), finish: Function}}
 */
export function createGenerationTrace(info = {}) {
    if (llmApiConfig.recordTrace === false) {
        return {agentCode: null, onTrace: null, finish: async () => {}}
    }
    /*续用已有记录（如向导链路第二步）*/
    const agentCode = info.traceCode || tools.getUUID()
    const agentCodePath = [agentCode]
    const operator = normalizeOperator(info.operator)
    let shellReady
    if (info.traceCode) {
        shellReady = Promise.resolve()
    } else {
        shellReady = addAgentTask({
            agentCode,
            title: info.title || `AI生成课件-${short(info.subject, 20)}`,
            agentType: 'local',
            handler: 'noop',
            handleMode: 'manual',
            handleStatus: 0,
            operator,
            params: {source: info.source || 'editor', subject: short(info.subject, 60)},
        }).catch(e => logger.warn(`创建生成过程记录任务失败: ${e.message || e}`))
    }
    /*串行写队列：单条失败只告警*/
    let queue = Promise.resolve()
    const onTrace = (ev) => {
        queue = queue.then(async () => {
            try {
                await shellReady
                await addAgentLog({
                    agentCode,
                    agentCodePath,
                    content: humanizeEvent(ev),
                    group: GROUP_MAP[ev && ev.event] || 'common',
                    extInfo: ev,
                    operator,
                })
            } catch (e) {
                logger.warn(`写入生成过程日志失败: ${e.message || e}`)
            }
        })
        return queue
    }
    const finish = async (handleStatus, handleRet) => {
        try {
            await queue
            await updateAgentTask(agentCode, {handleStatus, handleRet: handleRet || {}})
        } catch (e) {
            logger.warn(`更新生成过程记录任务状态失败: ${e.message || e}`)
        }
    }
    return {agentCode, onTrace, finish}
}

/**
 * @description agent管线路径的记录器：事件转被调方gRPC流的中间日志块，由llm.api侧grpcCall处理器逐条落agentLog
 * @param {Object} grpcCall 被调方流对象
 * @returns {Function} onTrace
 */
export function createGrpcCallTrace(grpcCall) {
    return (ev) => {
        try {
            grpcCall.write({
                handleStatus: 1,
                logContent: humanizeEvent(ev),
                logGroup: GROUP_MAP[ev && ev.event] || 'common',
                logExt: JSON.stringify(ev),
                handleRet: '',
            })
        } catch (e) { /* 流已关闭等场景忽略 */
        }
    }
}
