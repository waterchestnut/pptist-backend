/**
 * @fileOverview 创建课件的类型
 * @author xianyang
 * @module
 */
import Enumify from '../../../extends/Enumify.js'

export default class CreateTypeEnum extends Enumify {
    static manual = new CreateTypeEnum('manual', '用户手动添加')
    static ai = new CreateTypeEnum('ai', 'AI自动生成')
    static _ = this.closeEnum()
}