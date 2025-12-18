// @ts-ignore
/* eslint-disable */
import { ResponseStructure, pptonlineRequest as request } from '@/services/request';

/** 删除课件 删除课件 POST /ppt/ipmi/delete */
export async function postPptIpmiOpenApiDelete(
  body: {
    pptCode: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt/ipmi/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取课件的详细信息 获取课件全部信息结构 GET /ppt/ipmi/detail */
export async function getPptIpmiDetail(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: PPTONLINEAPI.getPptIpmiDetailParams,
  options?: { [key: string]: any },
) {
  return request<any>('/ppt/ipmi/detail', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  });
}

/** 禁用课件 禁用课件 POST /ppt/ipmi/disable */
export async function postPptIpmiDisable(
  body: {
    pptCode: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt/ipmi/disable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 启用课件 启用课件 POST /ppt/ipmi/enable */
export async function postPptIpmiEnable(
  body: {
    pptCode: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt/ipmi/enable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 课件列表 获取课件列表 POST /ppt/ipmi/list */
export async function postPptIpmiList(
  body: {
    filter?: Record<string, any>;
    pageIndex?: number;
    pageSize?: number;
    options?: { total?: number; sort?: Record<string, any> };
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt/ipmi/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 修改单个课件 修改单个课件 POST /ppt/ipmi/update */
export async function postPptIpmiUpdate(
  body: PPTONLINEAPI.PptInfo,
  options?: { [key: string]: any },
) {
  return request<any>('/ppt/ipmi/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
