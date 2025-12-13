/**
 * @fileOverview 课件的类型
 * @author xianyang
 * @module
 */
import Enumify from '../../../extends/Enumify.js'

export default class PptTypeEnum extends Enumify {
    static normal = new PptTypeEnum('normal', '普通课件')
    static alone = new PptTypeEnum('alone', '课件平台独自创建的课件')
    static buildInTmpl = new PptTypeEnum('buildInTmpl', '内置模版')
    static platformTmpl = new PptTypeEnum('platformTmpl', '平台模版')
    static userTmpl = new PptTypeEnum('userTmpl', '用户个人模版')
    static _ = this.closeEnum()
}