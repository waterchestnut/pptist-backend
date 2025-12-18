// @ts-ignore
/* eslint-disable */
import { ResponseStructure, pptonlineRequest as request } from '@/services/request';

/** 生成PPT内容 根据PPT大纲生成PPist需要的PPT内容 返回值: Default Response POST /llm/gen-ppt */
export async function postLlmGenPpt(
  body: {
    /** PPT大纲 */
    syllabus?: string;
    options?: { language?: string; style?: string };
  },
  options?: { [key: string]: any },
) {
  return request<{
    statusCode: number;
    code: number;
    msg?: string;
    errorLevel?: string;
    data?: { content?: string };
  }>('/llm/gen-ppt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 生成PPT大纲 根据主题生成PPT大纲 返回值: Default Response POST /llm/gen-ppt-syllabus */
export async function postLlmGenPptSyllabus(
  body: {
    /** 主题 */
    subject?: string;
    options?: { language?: string; max?: number };
  },
  options?: { [key: string]: any },
) {
  return request<{
    statusCode: number;
    code: number;
    msg?: string;
    errorLevel?: string;
    data?: { content?: string };
  }>('/llm/gen-ppt-syllabus', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 生成PPT大纲（流式） 根据主题生成PPT大纲，以event-stream返回 POST /llm/gen-ppt-syllabus/stream */
export async function postLlmGenPptSyllabusStream(
  body: {
    /** 主题 */
    subject?: string;
    options?: { language?: string; max?: number };
  },
  options?: { [key: string]: any },
) {
  return request<any>('/llm/gen-ppt-syllabus/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 生成PPT内容（流式） 根据PPT大纲生成PPist需要的PPT内容，以event-stream返回 POST /llm/gen-ppt/stream */
export async function postLlmGenPptStream(
  body: {
    /** PPT大纲 */
    syllabus?: string;
    options?: { language?: string; style?: string };
  },
  options?: { [key: string]: any },
) {
  return request<any>('/llm/gen-ppt/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取课程思政摘要 根据主题获取课程思政摘要内容 返回值: Default Response POST /llm/ideology */
export async function postLlmIdeology(
  body: {
    /** 主题 */
    subject?: string;
    options?: { max?: number };
  },
  options?: { [key: string]: any },
) {
  return request<{
    statusCode: number;
    code: number;
    msg?: string;
    errorLevel?: string;
    data?: PPTONLINEAPI.IdeologyDetail[];
  }>('/llm/ideology', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
