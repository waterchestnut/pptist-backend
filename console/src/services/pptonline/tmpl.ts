// @ts-ignore
/* eslint-disable */

import {ResponseStructure, pptonlineRequest} from '@/services/request'

/** 获取课件模版的AI提示词 */
export async function getTmplPrompts(tmplCode: string) {
  let ret = await pptonlineRequest('/ppt/tmpl/prompt', {
    method: 'GET',
    params: {tmplCode}
  })
  if (ret.code === 0) {
    return ret.data
  } else {
    return []
  }
}
