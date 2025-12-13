/**
 * @fileOverview 初始化连接、集成所有mongodb的schema
 * @author xianyang 2024/5/31
 * @module
 */

import mongoose from 'mongoose'
import pptInfoSchema from './pptInfoSchema.js'

const mongodbConfig = pptonline.config.mongodbConfig

async function getConnection(config) {
    for (let i = 1; i <= 3; ++i) {
        try {
            return await mongoose.createConnection(config.uri, config.options)
        } catch (err) {
            pptonline.logger.error(`第${i}次connect to %s error: ${mongodbConfig.uri}，${err.message}`)
            if (i >= 3) {
                process.exit(1)
            }
        }
    }
}

/**
 * 连接mongodb并导出Model
 */
const conn = await getConnection(mongodbConfig)

export const PptInfo = conn.model('PptInfo', pptInfoSchema, 'pptInfo')