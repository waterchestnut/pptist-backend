// @ts-ignore
/* eslint-disable */
import { ResponseStructure, pptonlineRequest as request } from '@/services/request';

/** 此处后端没有提供注释 GET /ppt/demo */
export async function getPptDemo(options?: { [key: string]: any }) {
  return request<any>('/ppt/demo', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 此处后端没有提供注释 GET /ppt/detail */
export async function getPptDetail(options?: { [key: string]: any }) {
  return request<any>('/ppt/detail', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 此处后端没有提供注释 POST /ppt/save */
export async function postPptSave(options?: { [key: string]: any }) {
  return request<any>('/ppt/save', {
    method: 'POST',
    ...(options || {}),
  });
}
