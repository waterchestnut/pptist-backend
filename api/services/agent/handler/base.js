/**
 * @fileOverview 本地智能体执行器基类
 * @author xianyang 2025/9/8
 * @module
 */

class BaseHandler {

    constructor() {
    }

    /**
     * @description 智能体任务执行
     * @param {Object} agentTaskInfo 任务信息
     * @param {Object} grpcCall grpc服务调用器
     * @returns {Promise<Object>} 执行结果，{handleStatus: 0[执行后状态], handleRet: null[执行结果值], logContent: ''[日志内容], logGroup: ''[日志分组]
     */
    async exec(agentTaskInfo, grpcCall) {
        return {
            handleStatus: 0,
            handleRet: null,
            logContent: '',
            logGroup: '',
        }
    }
}

export default BaseHandler