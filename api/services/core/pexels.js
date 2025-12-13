/**
 * @fileOverview pexels免费图片、视频的操作
 * @author xianyang 2025/12/1
 * @module
 */

import retSchema from '../../daos/retSchema.js'
import {getQueryString} from '../../tools/queryString.js'

const tools = pptonline.tools
const logger = pptonline.logger
const config = pptonline.config
const pexelsConfig = config.pexelsConfig

/*图片检索的代理*/
export async function proxyImgSearch(oriParams) {
    delete oriParams.accessToken
    delete oriParams.refreshToken
    let res = await fetch(`${pexelsConfig.imgSearchUrl}?${getQueryString(oriParams)}`, {
        method: 'GET',
        headers: {'Content-Type': 'application/json', 'Authorization': pexelsConfig.searchKey},
    })
    let ret = await res.json()
    //console.log(res.headers.entries())
    return {
        data: ret.photos?.map(_ => ({
            id: _.id,
            width: _.id,
            height: _.height,
            src: _.src.large
        })),
        code: 0,
        total: ret.total_results,
        ratelimit: {
            limit: res.headers.get('x-ratelimit-limit'),
            remaining: res.headers.get('x-ratelimit-remaining'),
            reset: res.headers.get('x-ratelimit-reset')
        },
        state: 1
    }
}