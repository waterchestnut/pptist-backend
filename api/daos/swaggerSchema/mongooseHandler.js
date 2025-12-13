/**
 * @fileOverview mongoose的schema转化为swagger的schema
 * @author xianyang 2024/5/9
 * @module
 */

import mongoose from 'mongoose'
import m2s from 'mongoose-to-swagger-2'
import * as models from '../core/schema/index.js'
import fs from 'fs'
import {getIdeologyContent} from '../../services/core/llm.js'

const baseDir = pptonline.baseDir

export function convertToSwaggerSchema(mongooseSchema, options = {}) {
    return {
        type: 'object',
        ...m2s(mongooseSchema, {
            props: ['title'],
            omitFields: ['_id', 'insertTime', 'updateTime', 'pwd', '__v', '__options'],
            omitMongooseInternals: true,
            ...options
        })
    }
}

export const getAllStoreModels = (options = {}) => {
    let ret = {}
    for (let key in models) {
        ret[key] = convertToSwaggerSchema(models[key], {omitFields: [], ...options})
    }

    return ret
}

export const getAllParamModels = (options = {}) => {
    let ret = {}
    for (let key in models) {
        ret[key] = convertToSwaggerSchema(models[key], options)
    }

    ret.IdeologyDetail = {
        title: 'IdeologyDetail',
        description: '课程思政详细信息',
        properties: {
            ragSegmentCode: {type: 'string', nullable: true, description: '材料片段标识'},
            text: {type: 'string', description: '材料摘要'},
            title: {type: 'string', nullable: true, description: '材料原文标题'},
            url: {type: 'string', nullable: true, description: '材料原文访问地址'},
        }
    }

    return ret
}

export const getAllDefinitionModels = async (options = {}) => {
    let ret = {}
    let path = baseDir + 'daos/core/definition'
    let files = fs.readdirSync(path)
    for (let file of files) {
        if (~file.indexOf('.js')) {
            let fileName = file.substring(0, file.indexOf('.js'))
            let Model = await import('../core/definition/' + fileName + '.js')
            /*console.log(Model.default)*/
            ret[fileName] = convertToSwaggerSchema(mongoose.model(fileName, Model.default), options)
        }
    }
    return ret
}