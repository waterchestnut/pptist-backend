import BaseEnum, {Label, MXEnum} from './BaseEnum'

@MXEnum
export default class extends BaseEnum {
  @Label('普通课件')
  static normal = 'normal'
  @Label('课件平台独自创建的课件')
  static alone = 'alone'
  @Label('内置模版')
  static buildInTmpl = 'buildInTmpl'
  @Label('平台模版')
  static platformTmpl = 'platformTmpl'
  @Label('用户个人模版')
  static userTmpl = 'userTmpl'
}

