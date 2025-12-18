// @ts-ignore
/* eslint-disable */
import { ResponseStructure, pptonlineRequest as request } from '@/services/request';

/** 删除课件 删除课件 POST /ppt-my/delete */
export async function postPptMyOpenApiDelete(
  body: {
    pptCode: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt-my/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取课件的详细信息 获取课件全部信息结构 GET /ppt-my/detail */
export async function getPptMyDetail(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: PPTONLINEAPI.getPptMyDetailParams,
  options?: { [key: string]: any },
) {
  return request<any>('/ppt-my/detail', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  });
}

/** 禁用课件 禁用课件 POST /ppt-my/disable */
export async function postPptMyDisable(
  body: {
    pptCode: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt-my/disable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 启用课件 启用课件 POST /ppt-my/enable */
export async function postPptMyEnable(
  body: {
    pptCode: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt-my/enable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 课件列表 获取我创建的课件列表 POST /ppt-my/list */
export async function postPptMyList(
  body: {
    filter?: Record<string, any>;
    pageIndex?: number;
    pageSize?: number;
    options?: { total?: number; sort?: Record<string, any> };
  },
  options?: { [key: string]: any },
) {
  return request<any>('/ppt-my/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 修改单个课件 修改单个课件 POST /ppt-my/update */
export async function postPptMyUpdate(
  body: PPTONLINEAPI.PptInfo,
  options?: { [key: string]: any },
) {
  return request<any>('/ppt-my/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
