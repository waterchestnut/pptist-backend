/**
 * @fileOverview 课件信息的结构
 * @author xianyang 2024/5/31
 * @module
 */

import mongoose from 'mongoose'
import StatusEnum from '../enum/StatusEnum.js'
import Tag from '../definition/Tag.js'
import Operator from '../definition/Operator.js'
import CreateTypeEnum from '../enum/CreateTypeEnum.js'
import PptTypeEnum from '../enum/PptTypeEnum.js'

const Schema = mongoose.Schema
const tools = pptonline.tools

/**
 * @description 定义pptInfo的结构
 * @author xianyang
 * @property {String} pptCode 唯一标识
 * @property {String} title 课件标题
 * @property {Schema.Types.Mixed} theme 主题样式
 * @property {Schema.Types.Mixed[]} slides 课件的页面数据
 * @property {Number} slideIndex 当前编辑的页面索引
 * @property {Number} viewportSize 可视区域宽度基数
 * @property {Number} viewportRatio 可视区域比例，默认16:9
 * @property {Number} width 页面宽度
 * @property {Number} height 页面高度
 * @property {Schema.Types.Mixed[]} templates 课件模版（整个编辑器可用的模型，该字段已废弃）
 * @property {Schema.Types.Mixed} operator 课件制作者，参加Operator
 * @property {String} coverUrl 课件封面图
 * @property {String} firstSlideImgUrl 课件首页截图
 * @property {Number} status 状态：参见StatusEnum
 * @property {Schema.Types.Mixed[]} tags 标签，参见Tag
 * @property {String} externalSource 外部来源标识，raisef等
 * @property {String} createType 课件添加方式：参见CreateTypeEnum
 * @property {String} pptType 课件类型：参见PptTypeEnum
 * @property {String} templateCode 课件创建时使用的模版标识
 * @property {String} description 详细介绍
 * @property {Boolean} aiIndividual AI使用模版时特殊处理
 * @property {Date} insertTime 创建时间
 * @property {Date} updateTime 最近更新时间
 */
const pptInfoSchema = new Schema({
    pptCode: {
        type: String,
        default: function () {
            return tools.getUUID()
        },
        description: '课件标识',
        required: true
    },
    title: {type: String, description: '课件标题'},
    theme: {type: Object, description: '主题'},
    slides: {type: [Object], description: '页面数据'},
    slideIndex: {type: Number, description: '页面索引'},
    viewportSize: {type: Number, description: '可视区域宽度基数'},
    viewportRatio: {type: Number, description: '可视区域比例'},
    width: {type: Number, description: '页面宽度'},
    height: {type: Number, description: '页面高度'},
    templates: {type: [Object], default: [], description: '模版'},
    operator: {type: Operator, description: '作者'},
    coverUrl: {type: String, description: '课件封面图'},
    firstSlideImgUrl: {type: String, description: '课件首页截图'},
    status: {type: Number, default: 0, description: '状态', enum: StatusEnum.toValues()},
    tags: {type: [Tag], description: '标签'},
    externalSource: {type: String, description: '外部来源标识'},
    createType: {
        type: String,
        default: CreateTypeEnum.manual.value,
        description: '课件添加方式',
        enum: CreateTypeEnum.toValues()
    },
    pptType: {
        type: String,
        default: PptTypeEnum.normal.value,
        description: '课件类型',
        enum: PptTypeEnum.toValues()
    },
    templateCode: {type: String, description: '课件创建时使用的模版标识'},
    description: {type: String, description: '详细介绍'},
    aiIndividual: {type: Boolean, default: false, description: 'AI使用模版时特殊处理'},
    insertTime: {
        type: Date, default: function () {
            return new Date()
        },
        description: '插入时间'
    },
    updateTime: {
        type: Date, default: function () {
            return new Date()
        },
        description: '最近更新时间'
    },
})

/**
 * @description 索引
 */
pptInfoSchema.index({insertTime: 1})
pptInfoSchema.index({updateTime: 1})
pptInfoSchema.index({pptCode: 1})
pptInfoSchema.index({'operator.userCode': 1})
pptInfoSchema.index({'tags.key': 1})
pptInfoSchema.index({'tags.value': 1})
pptInfoSchema.index({externalSource: 1})
pptInfoSchema.index({createType: 1})
pptInfoSchema.index({pptType: 1})
pptInfoSchema.index({templateCode: 1})

export default pptInfoSchema