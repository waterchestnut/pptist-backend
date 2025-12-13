/**
 * @fileOverview 操作mongodb库中的pptInfo
 * @author xianyang
 * @module
 */

import {PptInfo} from '../schema/index.js'
import BaseDac from './BaseDac.js'
import * as tools from '../../../tools/index.js'

export class PptInfoDac extends BaseDac {
    constructor(Model) {
        super(Model, 'pptCode')
    }

    assembleParams(options) {
        let params = super.assembleParams(options)
        if (tools.isArray(options.pptCode)) {
            params.$and.push({pptCode: {$in: options.pptCode}})
        } else if (options.pptCode) {
            params.$and.push({pptCode: {$eq: options.pptCode}})
        }
        if (options.templateCode) {
            params.$and.push({templateCode: {$eq: options.templateCode}})
        }
        if (options.operatorUserCode) {
            params.$and.push({'operator.userCode': {$eq: options.operatorUserCode}})
        }
        if (tools.isArray(options.createType)) {
            params.$and.push({createType: {$in: options.createType}})
        } else if (options.createType) {
            params.$and.push({createType: {$eq: options.createType}})
        }
        if (tools.isArray(options.pptType)) {
            params.$and.push({pptType: {$in: options.pptType}})
        } else if (options.pptType) {
            params.$and.push({pptType: options.pptType})
        }
        if (tools.isExist(options.title)) {
            params.$and.push({title: {$regex: new RegExpExt(options.title, 'i', true)}})
        }
        if (tools.isExist(options.description)) {
            params.$and.push({description: {$regex: new RegExpExt(options.description, 'i', true)}})
        }
        if (tools.isArray(options.externalSource)) {
            params.$and.push({externalSource: {$in: options.externalSource}})
        } else if (!tools.isUndefined(options.externalSource)) {
            params.$and.push({externalSource: {$eq: options.externalSource}})
        }
        if (tools.isExist(options.keyword)) {
            let keywordReg = {$regex: new RegExpExt(options.keyword, 'i', true)}
            params.$and.push({
                $or: [
                    {title: keywordReg},
                    {description: keywordReg},
                    {'tags.value': keywordReg},
                ]
            })
        }
        return params
    }
}

export default new PptInfoDac(PptInfo)