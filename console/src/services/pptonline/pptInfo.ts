// @ts-ignore
/* eslint-disable */

import {ResponseStructure, pptonlineRequest} from '@/services/request'

/** 获取课件列表 */
export async function getPptInfoList(pageIndex = 1, pageSize = 10, filter = {}, options: API.ListOptions = {}, relativeUrl = '') {
  let ret = await pptonlineRequest(relativeUrl || '/ppt/ipmi/list', {
    method: 'POST',
    data: {filter, pageIndex, pageSize, options}
  })
  if (ret.code === 0) {
    return ret.data
  } else {
    return {total: 0}
  }
}

/** 添加课件 */
export async function addPptInfo(params: any, relativeUrl = '') {
  return pptonlineRequest(relativeUrl || '/ppt/save', {
    method: 'POST',
    data: params
  })
}

/** 修改课件 */
export async function updatePptInfo(params: any, relativeUrl = '') {
  return pptonlineRequest(relativeUrl || '/ppt/ipmi/update', {
    method: 'POST',
    data: params,
    params: {pptCode: params.pptCode}
  })
}

/** 删除课件 */
export async function deletePptInfo(pptCode: string, relativeUrl = '') {
  return pptonlineRequest(relativeUrl || '/ppt/ipmi/delete', {
    method: 'POST',
    data: {pptCode}
  })
}

/** 启用课件 */
export async function enablePptInfo(pptCode: string, relativeUrl = '') {
  return pptonlineRequest(relativeUrl || '/ppt/ipmi/enable', {
    method: 'POST',
    data: {pptCode}
  })
}

/** 禁用课件 */
export async function disablePptInfo(pptCode: string, relativeUrl = '') {
  return pptonlineRequest(relativeUrl || '/ppt/ipmi/disable', {
    method: 'POST',
    data: {pptCode}
  })
}

/** 获取课件基本信息 */
export async function getPptInfo(pptCode: string, relativeUrl = '') {
  let ret = await pptonlineRequest(relativeUrl || '/ppt/ipmi/detail', {
    method: 'GET',
    params: {pptCode}
  })

  return ret?.data
}

/** 导入课件 */
export async function importPptx(params: any) {
  return pptonlineRequest('/ppt/import-pptx', {
    method: 'POST',
    data: params
  })
}
