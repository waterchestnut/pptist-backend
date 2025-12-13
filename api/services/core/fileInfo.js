/**
 * @fileOverview 文件相关的处理
 * @author xianyang 2025/11/29
 * @module
 */
import {excel2Text, html2Text, pdf2Text, word2Text} from '../../grpc/clients/extractor.js'
import {saveFile} from "../../grpc/clients/fileManage.js";
import fetch from 'node-fetch'
import {sha1} from "../../tools/security.js";
import {getUUID4} from "../../tools/index.js";

const tools = pptonline.tools
const logger = pptonline.logger
const config = pptonline.config

const MIME_MAP = {

    // 图片类型
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/x-ms-bmp': 'bmp',
    'image/webm': 'weba',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/vnd.microsoft.icon': 'ico',
    'image/emf': 'emf',
    'image/x-emf': 'emf',
    'image/wmf ': 'wmf',
    'image/x-wmf ': 'wmf',

    // 音频类型
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'oga',
    'audio/wav': 'wav',
    'audio/webm': 'weba',
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/x-aiff': 'aif',
    'audio/x-ms-wma': 'wma',
    'audio/midi': 'mid',

    // 视频类型
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/ogg': 'ogv',
    'video/webm': 'webm',
    'video/x-msvideo': 'avi',
    'video/quicktime': 'mov',
    'video/x-ms-wmv': 'wmv',
    'video/x-flv': 'flv',
    'video/3gpp': '3gp',
    'video/3gpp2': '3g2'
}

/**
 * @description 拼接文件服务的绝对地址
 */
export const getDocHttpUrl = (relativeUrl) => {
    if (relativeUrl.startsWith('http')) {
        return relativeUrl
    }

    return `${config.docConfig.baseIntranetUrl}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`
}

/*调用接口提取文本*/
export async function getFileText(fileInfo) {
    let url = `${config.docConfig.baseIntranetUrl}/file/download/?fileCode=${fileInfo.fileCode}`
    const fileRes = await fetch(url)
    let text = ''
    if (['pdf'].includes(fileInfo.fileExt)) {
        text = await pdf2Text(new Uint8Array(await fileRes.arrayBuffer()), 'en')
    } else if (['doc', 'docx'].includes(fileInfo.fileExt)) {
        text = await word2Text(new Uint8Array(await fileRes.arrayBuffer()), 'en')
    } else if (['xls', 'xlsx'].includes(fileInfo.fileExt)) {
        text = await excel2Text(new Uint8Array(await fileRes.arrayBuffer()), fileInfo.fileExt)
    } else if (['html'].includes(fileInfo.fileExt)) {
        text = html2Text(new Uint8Array(await fileRes.arrayBuffer()), 'en')
    } else {
        text = await fileRes.text()
    }

    return text
}

export async function uploadFromDataUrl(dataUrl, userInfo) {
    try {
        let res = await fetch(dataUrl);
        let buffer = Buffer.from(await res.arrayBuffer())
        let fileCode = sha1(dataUrl);
        let fileInfo = await saveFile(userInfo, fileCode, {fileName: `${getUUID4()}.${MIME_MAP[res.headers.get('content-type')]}`}, {}, buffer, '');
        return `${config.docConfig.baseUrl}/file/download/?fileCode=${fileCode}`;
    } catch (e) {
        return dataUrl;
    }

}