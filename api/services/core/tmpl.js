/**
 * @fileOverview 课件模版相关的使用
 * @author xianyang 2025/11/28
 * @module
 */

import pptInfoDac from '../../daos/core/dac/pptInfoDac.js'
import retSchema from '../../daos/retSchema.js'
import * as cheerio from 'cheerio'

const tools = pptonline.tools
const logger = pptonline.logger
const config = pptonline.config
const rerankConfig = config.rerankConfig

const slideTypeOptions = [
    {label: '封面页', value: 'cover'},
    {label: '目录页', value: 'contents'},
    {label: '过渡页', value: 'transition'},
    {label: '内容页', value: 'content'},
    {label: '结束页', value: 'end'},
]

const textTypeOptions = [
    {label: '标题', value: 'title'},
    {label: '副标题', value: 'subtitle'},
    {label: '正文', value: 'content', tmplKey: 'text'},
    {label: '列表项目', value: 'item', tmplKey: 'text'},
    {label: '列表项标题', value: 'itemTitle', tmplKey: 'title'},
    {label: '注释', value: 'notes'},
    {label: '页眉', value: 'header'},
    {label: '页脚', value: 'footer'},
    {label: '节编号', value: 'partNumber'},
    {label: '项目编号', value: 'itemNumber'},
]

const imageTypeOptions = [
    {label: '页面插图', value: 'pageFigure'},
    {label: '项目插图', value: 'itemFigure'},
    {label: '背景图', value: 'background'},
]

/**
 * @description 获取当前用户可以使用的全部模版
 * @author xianyang
 * @param {Object} curUserInfo 当前登录用户
 * @returns {Promise<Object>} 保存后的课件信息
 */
export async function getCurAllTmpls(curUserInfo) {
    let $orList = [{pptType: {$in: ['buildInTmpl', 'platformTmpl']}}]
    if (curUserInfo?.userCode) {
        $orList.push({'operator.userCode': curUserInfo.userCode, pptType: 'userTmpl'})
    }
    let optionsIn = {
        complexFilter: [
            {
                $or: $orList
            }
        ],
        status: 0,
        sort: {updateTime: -1}
    }
    let ret = await pptInfoDac.getByPage(1, 30, optionsIn)
    return (ret?.rows || []).map(_ => ({
        pptCode: _.pptCode,
        title: _.title,
        coverUrl: _.coverUrl,
        description: _.description,
    }))
}

/*从PPT模版中提取AI生成PPT的示例提示词*/
export async function extractorTmplPrompts(tmplCode, tmplInfo) {
    tmplInfo = tmplInfo || (await pptInfoDac.getByCode(tmplCode))
    if (!tmplInfo?.slides?.length) {
        return []
    }
    let examples = []
    tmplInfo.slides.forEach(slide => {
        if (!slide.type) {
            return
        }
        let slideTypeInfo = slideTypeOptions.find(_ => _.value === slide.type)
        if (!slideTypeInfo) {
            return
        }
        let example = {id: slide.id, type: slide.type, data: {items: []}}
        examples.push(example)
        slide.elements?.forEach(element => {
            let groupId = element.groupId
            if (element.textType) {
                let textTypeInfo = textTypeOptions.find(_ => _.value === element.textType)
                if (!textTypeInfo) {
                    return
                }
                if (['title', 'subtitle', 'content'].includes(textTypeInfo.value)) {
                    example.data[textTypeInfo.tmplKey || textTypeInfo.value] = `${textTypeInfo.label}，建议${getTextFromHtml(element.content)?.length}个字以内`
                }
                if (['item', 'itemTitle'].includes(textTypeInfo.value)) {
                    let itemInfo
                    if (groupId) {
                        itemInfo = example.data.items.find(_ => _.groupId === groupId)
                    }
                    if (!itemInfo) {
                        itemInfo = {elements: {}}
                        if (groupId) {
                            itemInfo.groupId = groupId
                        }
                        example.data.items.push(itemInfo)
                    }
                    itemInfo[textTypeInfo.tmplKey || textTypeInfo.value] = `${textTypeInfo.label}，建议${getTextFromHtml(element.content)?.length}个字以内`
                    itemInfo.elements[textTypeInfo.value] = element
                }
            } else if (element.imageType) {
                let imageTypeInfo = imageTypeOptions.find(_ => _.value === element.imageType)
                if (!imageTypeInfo) {
                    return
                }
                if (['pageFigure', 'background'].includes(imageTypeInfo.value)) {
                    example.data[imageTypeInfo.tmplKey || imageTypeInfo.value] = `${imageTypeInfo.label}`
                }
                if (['itemFigure'].includes(imageTypeInfo.value)) {
                    let itemInfo
                    if (groupId) {
                        itemInfo = example.data.items.find(_ => _.groupId === groupId)
                    }
                    if (!itemInfo) {
                        itemInfo = {elements: {}}
                        if (groupId) {
                            itemInfo.groupId = groupId
                        }
                        example.data.items.push(itemInfo)
                    }
                    itemInfo[imageTypeInfo.tmplKey || imageTypeInfo.value] = `${imageTypeInfo.label}`
                    itemInfo.elements[imageTypeInfo.value] = element
                }
            }
        })
        if (!example.data.items.length) {
            delete example.data.items
        } else {
            example.data.items.sort((a, b) => {
                let aContent = ''
                let bContent = ''
                let aElement = a.elements.itemNumber || a.elements.itemTitle || a.elements.item || a.elements.itemFigure
                let bElement = b.elements.itemNumber || b.elements.itemTitle || b.elements.item || b.elements.itemFigure
                if (aElement.type === 'text') aContent = aElement.content
                if (aElement.type === 'shape') aContent = aElement.text?.content || ''
                if (bElement.type === 'text') bContent = bElement.content
                if (bElement.type === 'shape') bContent = bElement.text?.content || ''
                if (aContent) {
                    aContent = getTextFromHtml(aContent)
                }
                if (bContent) {
                    bContent = getTextFromHtml(bContent)
                }
                return aContent.localeCompare(bContent, 'en')
            })
            example.data.items.forEach((item, index) => {
                delete item.elements
            })
        }
    })
    return examples
}

/*提取HTML的纯文本*/
function getTextFromHtml(htmlStr) {
    const $ = cheerio.load(htmlStr)
    return $.text()
}

/*获取与给定文本意思最贴合的PPT模版*/
export async function getMostSuitableTmpl(text, operator) {
    let tmplList = await getCurAllTmpls(operator)
    if (!tmplList.length) {
        return null
    }

    let documents = tmplList.map(tmpl => `${tmpl.description}`)
    let res = await fetch(rerankConfig.baseURL, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: rerankConfig.model,
            query: text,
            documents: documents
        })
    })
    let newDocuments = (await res.json()).results
    return tmplList[newDocuments[0].index]
}