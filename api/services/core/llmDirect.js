/**
 * @fileOverview AI直出模式：不经模板，由大模型直接生成符合pptist规范的最终slides JSON数据
 * 采用两阶段管线：1)全局设计规划（标题/主题/逐页版式编排） 2)逐页生成最终Slide JSON（含搜图、校验、排版体检）
 * @author xianyang 2026/10/14
 * @module
 */

import fs from 'fs'
import {OpenAI} from 'openai'
import {jsonrepair} from 'jsonrepair'
import {getFileText} from './fileInfo.js'
import {proxyImgSearch} from './pexels.js'

const config = pptonline.config
const pptGenLLMConfig = config.pptGenLLMConfig
const tools = pptonline.tools
const logger = pptonline.logger
const baseDir = pptonline.baseDir

const CANVAS_WIDTH = 1000
const CANVAS_HEIGHT = 562.5
const VIEWPORT_RATIO = 0.5625
const ALLOWED_ELEMENT_TYPES = ['text', 'image', 'shape', 'line', 'table', 'chart']
const CHART_TYPES = ['bar', 'column', 'line', 'pie', 'ring', 'area', 'radar', 'scatter']
const PAGE_TYPES = ['cover', 'contents', 'transition', 'content', 'end']

/*---------------- 设计知识（运行时从磁盘加载并缓存） ----------------*/

let _schemaDoc = null
let _knowledge = null

function getSchemaDoc() {
    if (!_schemaDoc) {
        _schemaDoc = fs.readFileSync(`${baseDir}services/core/prompts/AI_PPT_SCHEMA.md`, 'utf-8')
    }
    return _schemaDoc
}

export function getDesignKnowledge() {
    if (!_knowledge) {
        _knowledge = JSON.parse(fs.readFileSync(`${baseDir}services/core/prompts/design-knowledge.json`, 'utf-8'))
    }
    return _knowledge
}

/*版式菜单文本（注入提示词）*/
function buildLayoutMenu() {
    const knowledge = getDesignKnowledge()
    return knowledge.layouts.map(l => {
        const pageTypes = Object.keys(l.pageTypes).join('/')
        return `- ${l.key}【${l.name}】(适用页型:${pageTypes}; 平均元素数:${l.avgElementCount})：${l.description}`
    }).join('\n')
}

/*从专业模板统计出的字号阶梯与装饰规律文本*/
function buildDesignStats() {
    const knowledge = getDesignKnowledge()
    const t = knowledge.typography
    const deco = knowledge.decorationPatterns
    const fmt = (v) => (v === null || v === undefined) ? '-' : v
    return `以下规律统计自${knowledge.stats.templates}套专业模板共${knowledge.stats.slides}页真实设计（作为字号与装饰基准）：
- 页标题字号：中位${fmt(t.title?.median)}px，常用区间${fmt(t.title?.p25)}~${fmt(t.title?.p75)}px
- 列表项标题：中位${fmt(t.itemTitle?.median)}px；列表项正文：中位${fmt(t.item?.median)}px
- 纯正文：中位${fmt(t.content?.median)}px；副标题：中位${fmt(t.subtitle?.median)}px
- 装饰元素出现率：顶部色带${(deco.topBand * 100).toFixed(0)}%、角落装饰形状${(deco.cornerMark * 100).toFixed(0)}%、分割线${(deco.dividerLine * 100).toFixed(0)}%、侧边色带${(deco.sideBand * 100).toFixed(0)}%
- 卡片类版式（cards-*）合计占比最高，内容页优先使用卡片/图形分组组织信息，而非纯文字列表`
}

/*取指定版式的黄金样例*/
function getGoldenSlide(layoutKey) {
    const knowledge = getDesignKnowledge()
    return knowledge.goldenSlides.find(g => g.layoutKey === layoutKey)?.slide || null
}

/*---------------- 提示词 ----------------*/

const planSysPrompt = `
## 角色
你是一位资深课件视觉设计师与内容策划专家。你不依赖任何模板，直接为整套课件做全局设计规划：决定标题、配色主题（设计DNA）、以及每一页的页面类型与版式。

## 任务
根据用户提供的主题和材料，输出一份JSON格式的全局设计规划。

## 页面结构规则
- 总页数10~20页，按信息量决定
- 必须包含：1个cover（封面）、1个contents（目录）、多个transition（章节过渡页）、多个content（内容页）、1个end（结束页）
- 每个章节以transition页开始，章节内可有1~3个content页
- contents目录页的条目与transition章节一一对应

## 版式编排规则（防单调，必须严格遵守）
- 相邻的两个content页不得使用相同layout
- 全稿content页至少使用4种不同的layout
- 至少60%的content页带视觉锚点（即该页规划了imageQueries，或版式本身含图片/卡片/图表）
- 至少1个data-chart或data-table数据页（数据可为合理的演示数据，文本中无需标注演示字样）
- 强烈建议包含：1个big-number大数字页、1个full-image全图金句页
- 只允许从下方"可用版式菜单"中选择layout

## 可用版式菜单
${buildLayoutMenu()}

## 设计DNA要求
- palette：一组协调的配色（4~6个HEX色值），第1个为主色，须与主题气质匹配
- backgroundColor：全稿页面背景基调（HEX，可为浅色）；fontName：从数据规范的可用字体列表中选择
- visualDirection：一句话描述整体视觉方向（如"深蓝商务·大留白·圆角卡片"）

## 排版基准
${buildDesignStats()}

## 输出格式（严格JSON，不要任何额外解释）
{
  "title": "课件主标题（15字以内）",
  "design": {
    "visualDirection": "整体视觉方向",
    "palette": ["#主色", "#辅色1", "#辅色2", "#辅色3"],
    "backgroundColor": "#页面背景色",
    "fontColor": "#正文默认色",
    "fontName": "字体key"
  },
  "pages": [
    {"type": "cover", "layout": "cover-center", "title": "封面标题", "subtitle": "副标题（20字以内）"},
    {"type": "contents", "layout": "contents-list", "items": ["章节标题1", "章节标题2"]},
    {"type": "transition", "layout": "transition-number", "number": "01", "title": "章节标题", "text": "章节导语（40字以内）"},
    {"type": "content", "layout": "cards-3", "title": "页标题", "points": [{"title": "要点标题（10字内）", "text": "要点正文（40~80字）"}], "imageQueries": ["english pexels keywords"]},
    {"type": "content", "layout": "data-chart", "title": "页标题", "points": [{"text": "数据结论（40字内）"}], "chart": {"chartType": "column", "labels": ["Q1", "Q2"], "legends": ["营收"], "series": [[100, 130]]}},
    {"type": "end", "layout": "full-image", "title": "谢谢聆听", "text": "结束语"}
  ]
}
注：content页points为1~6项；imageQueries仅在版面含图片位时给出（英文检索词）；样例中的省略号位置都应替换为实际内容。
`

/*单页生成系统提示词*/
function buildSlideSysPrompt(design, pageSpec) {
    const layoutMeta = getDesignKnowledge().layouts.find(l => l.key === pageSpec.layout)
    return `
## 角色
你是pptist课件渲染引擎的版式设计模块。根据给定的页面规划，输出一页完整的、符合下述数据规范的Slide JSON。你的输出将被直接渲染，没有任何后处理。

## 数据规范（唯一事实来源，严格遵守）
${getSchemaDoc()}

## 全局设计DNA（所有页共用，必须保持一致）
- 视觉方向：${design.visualDirection}
- 主题色板：${design.palette.join(', ')}（第1个为主色，用于标题装饰、卡片描边、强调文字）
- 页面背景：${design.backgroundColor}；正文默认色：${design.fontColor}；默认字体：${design.fontName}
- 可用字体仅限数据规范中列出的字体key

## 本页版式
- 版式：${pageSpec.layout}${layoutMeta ? `【${layoutMeta.name}】${layoutMeta.description}` : ''}
- 页面类型：${pageSpec.type}

## 版式规则
${buildDesignStats()}

## 防溢出硬规则（必须遵守）
- 每行可容纳的字符数约等于 floor(元素宽度 / 字号)，中文按1字符、英文按0.5字符计
- 文本元素所需高度约等于 行数 x 字号 x 行高 + 8，必须小于等于元素高度，字数超出请精简文案或增大元素高度
- 画布为${CANVAS_WIDTH} x ${CANVAS_HEIGHT}，左右安全边距不小于40，任何元素不得超出画布超过40
- 单页元素总数控制在3~14个

## 页面型装饰最低要求
- cover：必须有背景（整幅图/渐变色/大色块组合），标题不小于40px
- contents：条目必须配编号或项目符号装饰形状
- transition：必须有超大节编号（60px以上文本或装饰形状）
- content：除标题正文外，必须至少有1个视觉锚点（图片、卡片形状组、图表、大数字），禁止纯两段文字交差
- end：必须有装饰色块或整幅图片

## 图片占位协议（重要）
- image元素的src一律填空字符串""，并额外提供"query"字段填写英文Pexels检索词（描述画面内容，如"modern office teamwork"）；系统会用真实图片替换，切勿编造URL
- 优先使用模板常见做法：圆角（radius）、裁剪（clip）、灰度滤镜（filters.grayscale）

## 其他
- 元素id以el_前缀且页内唯一；富文本HTML只允许数据规范白名单内的标签与样式
- 文本内容使用规划中的文案，可按排版需要微调标点，不得大幅改写
- 只输出一个Slide JSON对象，不要markdown围栏、不要任何解释
`
}

function buildSlideUserPrompt(plan, pageIndex, fileText) {
    const pageSpec = plan.pages[pageIndex]
    const outline = plan.pages.map((p, i) => `${i === pageIndex ? '>>' : '  '} ${i + 1}.[${p.type}/${p.layout}] ${p.title || (p.items ? p.items.join('、') : '')}`).join('\n')
    const golden = getGoldenSlide(pageSpec.layout)
    const goldenBlock = golden
        ? `\n## 黄金样例（与本页相同版式的真实专业设计，参考其布局手法、装饰细节与字号比例，但文案必须替换为本页内容）\n${JSON.stringify(golden)}`
        : ''
    return `## 课件标题
${plan.title}

## 全稿大纲（>>为当前要生成的页）
${outline}

## 当前页面（第${pageIndex + 1}页，共${plan.pages.length}页）的规划
${JSON.stringify(pageSpec)}
${fileText ? `\n## 参考材料（内容优先取材于此）\n${fileText.substring(0, 4000)}\n` : ''}${goldenBlock}`
}

/*---------------- LLM调用 ----------------*/

async function callLLM(messages, options = {}) {
    const openai = new OpenAI({
        apiKey: pptGenLLMConfig.apiKey,
        baseURL: pptGenLLMConfig.baseURL,
    })
    let ret = await openai.chat.completions.create({
        model: options.model || pptGenLLMConfig.model,
        messages,
        max_tokens: Math.min(pptGenLLMConfig.maxTokens || 8192, 16384),
        temperature: options.temperature !== undefined ? options.temperature : pptGenLLMConfig.temperature || 0.7,
        stream: false,
        response_format: {type: 'json_object'},
    })
    if (!ret?.choices?.length) return null
    return ret.choices[0].message.content
}

function parseJSONText(text) {
    if (!text) return null
    let t = String(text).trim()
        .replace(/^```(json)?/i, '')
        .replace(/```$/, '')
        .trim()
    try {
        return JSON.parse(t)
    } catch (e) {
        try {
            return JSON.parse(jsonrepair(t))
        } catch (e2) {
            return null
        }
    }
}

/*生成全局设计规划*/
export async function genPPTDirectPlan(subject, options = {}) {
    let fileText = ''
    if (options?.fileInfo?.fileCode) {
        fileText = await getFileText(options.fileInfo)
        fileText = fileText.substring(0, 20000)
    }
    const userPrompt = `
## 指定语言：${options.language || '中文'}
## 主题和信息：
${fileText || subject}
`
    let lastErr = null
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const content = await callLLM([
                {role: 'system', content: planSysPrompt},
                {role: 'user', content: userPrompt},
            ], {temperature: 0.6, model: options.model})
            let plan = parseJSONText(content)
            plan = normalizePlan(plan)
            if (plan) return {plan, fileText}
            lastErr = new Error('设计规划JSON解析失败')
        } catch (e) {
            lastErr = e
            logger.warn('genPPTDirectPlan 第%s次尝试失败: %s', attempt + 1, e.message || e)
        }
    }
    throw lastErr || new Error('设计规划生成失败')
}

/*规划兜底修正*/
const ALLOWED_FONTS = ['SourceHanSans', 'SourceHanSerif', 'WenDingPLKaiTi', 'WenDingPLSongTi', 'ZhuqueFangSong', 'LXGWWenKai', 'AlibabaPuHuiTi', 'MiSans', 'DeYiHei', 'CangerXiaowanzi', 'YousheTitleBlack', 'FengguangMingrui', 'ShetuModernSquare', 'ZcoolHappy', 'ZizhiQuXiMai', 'SucaiJishiKangkang', 'SucaiJishiCoolSquare', 'TuniuRounded', 'RuiziZhenyan', 'SourceSerif4', 'JetBrainsMono', 'Literata', 'Inter', 'Roboto', 'OpenSans', 'Montserrat', 'SourceSansPro', 'Merriweather']

function normalizePlan(plan) {
    if (!plan || !Array.isArray(plan.pages) || plan.pages.length < 5) return null
    plan.pages = plan.pages.filter(p => p && PAGE_TYPES.includes(p.type))
    if (!plan.pages.find(p => p.type === 'cover')) plan.pages.unshift({type: 'cover', layout: 'cover-center'})
    if (!plan.pages.find(p => p.type === 'end')) plan.pages.push({type: 'end', layout: 'cover-center'})
    plan.pages = plan.pages.slice(0, 24)
    let validLayouts = new Set(getDesignKnowledge().layouts.map(l => l.key))
    let lastContentLayout = null
    for (const p of plan.pages) {
        if (p.type === 'content' && (!validLayouts.has(p.layout) || p.layout === lastContentLayout)) {
            const menu = ['cards-3', 'split-image-right', 'list-rows', 'cards-4', 'image-top', 'split-image-left', 'timeline', 'title-bullets', 'big-number', 'data-chart']
            p.layout = menu.find(k => validLayouts.has(k) && k !== lastContentLayout) || 'cards-3'
        }
        if (p.type === 'content') lastContentLayout = p.layout
        if (p.type !== 'content' && !p.layout) p.layout = p.type === 'contents' ? 'contents-list' : (p.type === 'transition' ? 'transition-number' : 'cover-center')
    }
    if (!plan.title) plan.title = '未命名课件'
    const d = plan.design = plan.design || {}
    if (!Array.isArray(d.palette) || !d.palette.length) d.palette = ['#1D4ED8', '#60A5FA', '#0F172A', '#F8FAFC']
    d.palette = d.palette.filter(c => typeof c === 'string').slice(0, 6)
    if (!d.palette.length) d.palette = ['#1D4ED8', '#60A5FA', '#0F172A', '#F8FAFC']
    d.backgroundColor = d.backgroundColor || '#FFFFFF'
    d.fontColor = d.fontColor || '#333333'
    d.fontName = ALLOWED_FONTS.includes(d.fontName) ? d.fontName : 'SourceHanSans'
    d.visualDirection = d.visualDirection || '简约商务·卡片化'
    return plan
}

/*---------------- 元素清洗 ----------------*/

function round2(v) {
    return Math.round(v * 100) / 100
}

function num(v, dft) {
    return typeof v === 'number' && isFinite(v) ? round2(v) : dft
}

function isColor(v) {
    return typeof v === 'string' && (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v))
}

function sanitizeBackground(bg) {
    if (bg && typeof bg === 'object') {
        if (bg.type === 'gradient' && bg.gradient && Array.isArray(bg.gradient.colors) && bg.gradient.colors.length) {
            return {
                type: 'gradient',
                gradient: {
                    type: bg.gradient.type === 'radial' ? 'radial' : 'linear',
                    rotate: num(bg.gradient.rotate, 0),
                    colors: bg.gradient.colors.map(c => ({pos: num(c.pos, 100), color: isColor(c.color) ? c.color : '#FFFFFF'})),
                },
            }
        }
        if (bg.type === 'image' && typeof bg.image === 'string') {
            return {type: 'image', image: bg.image, size: bg.size || 'cover'}
        }
        if (isColor(bg.color)) return {type: 'solid', color: bg.color}
    }
    return {type: 'solid', color: '#FFFFFF'}
}

function sanitizeElement(el) {
    if (!el || typeof el !== 'object' || !ALLOWED_ELEMENT_TYPES.includes(el.type)) return null
    const base = {type: el.type, id: typeof el.id === 'string' && el.id ? el.id : `el_${tools.getUUID().substring(0, 8)}`, rotate: num(el.rotate, 0)}
    base.left = num(el.left, 0)
    base.top = num(el.top, 0)
    if (base.left < -80 || base.top < -80 || base.left > CANVAS_WIDTH + 80 || base.top > CANVAS_HEIGHT + 80) return null
    if (el.type === 'line') {
        if (!Array.isArray(el.start) || el.start.length !== 2 || !Array.isArray(el.end) || el.end.length !== 2) return null
        base.width = num(el.width, 2)
        base.start = [num(el.start[0], 0), num(el.start[1], 0)]
        base.end = [num(el.end[0], 0), num(el.end[1], 0)]
        base.style = ['solid', 'dashed', 'dotted'].includes(el.style) ? el.style : 'solid'
        base.color = isColor(el.color) ? el.color : '#999999'
        base.points = Array.isArray(el.points) && el.points.length === 2 ? el.points.map(p => ['', 'arrow', 'dot'].includes(p) ? p : '') : ['', '']
        return base
    }
    base.width = num(el.width, 10)
    base.height = num(el.height, 10)
    if (base.width < 2) base.width = 2
    if (base.height < 2) base.height = 2
    if (el.shadow && typeof el.shadow === 'object') base.shadow = el.shadow
    if (el.outline && typeof el.outline === 'object') base.outline = el.outline
    if (typeof el.opacity === 'number') base.opacity = Math.min(1, Math.max(0, el.opacity))
    switch (el.type) {
        case 'text': {
            if (typeof el.content !== 'string' || !el.content.trim()) return null
            base.content = el.content
            base.defaultFontName = typeof el.defaultFontName === 'string' ? el.defaultFontName : ''
            base.defaultColor = isColor(el.defaultColor) ? el.defaultColor : '#333333'
            if (typeof el.lineHeight === 'number') base.lineHeight = el.lineHeight
            if (typeof el.paragraphSpace === 'number') base.paragraphSpace = el.paragraphSpace
            if (typeof el.wordSpace === 'number') base.wordSpace = el.wordSpace
            if (isColor(el.fill)) base.fill = el.fill
            if (typeof el.textType === 'string') base.textType = el.textType
            break
        }
        case 'image': {
            base.src = typeof el.src === 'string' ? el.src : ''
            base.description = typeof el.description === 'string' ? el.description : ''
            if (typeof el.radius === 'number') base.radius = el.radius
            if (el.clip && Array.isArray(el.clip.range)) base.clip = el.clip
            if (el.filters && typeof el.filters === 'object') base.filters = el.filters
            base.fixedRatio = true
            break
        }
        case 'shape': {
            if (!Array.isArray(el.viewBox) || el.viewBox.length !== 2) return null
            if (typeof el.path !== 'string' || !el.path.trim()) return null
            base.viewBox = [num(el.viewBox[0], 100), num(el.viewBox[1], 100)]
            base.path = el.path
            base.fill = isColor(el.fill) ? el.fill : '#FFFFFF'
            if (el.gradient && Array.isArray(el.gradient.colors)) base.gradient = el.gradient
            if (el.text && typeof el.text.content === 'string') {
                base.text = {
                    content: el.text.content,
                    defaultFontName: el.text.defaultFontName || '',
                    defaultColor: isColor(el.text.defaultColor) ? el.text.defaultColor : '#333333',
                    align: ['top', 'middle', 'bottom'].includes(el.text.align) ? el.text.align : 'middle',
                }
                if (typeof el.text.lineHeight === 'number') base.text.lineHeight = el.text.lineHeight
            }
            break
        }
        case 'table': {
            if (!Array.isArray(el.data) || !el.data.length) return null
            let bad = false
            const data = el.data.map(row => {
                if (!Array.isArray(row)) {
                    bad = true
                    return []
                }
                return row.map(cell => ({
                    id: typeof cell?.id === 'string' ? cell.id : `c_${tools.getUUID().substring(0, 8)}`,
                    colspan: num(cell?.colspan, 1),
                    rowspan: num(cell?.rowspan, 1),
                    text: typeof cell?.text === 'string' ? cell.text : '',
                    ...(cell?.style ? {style: cell.style} : {}),
                }))
            })
            if (bad || !data.length) return null
            base.data = data
            base.colWidths = Array.isArray(el.colWidths) && el.colWidths.length === data[0].length ? el.colWidths : data[0].map(() => round2(1 / data[0].length))
            base.cellMinHeight = num(el.cellMinHeight, 40)
            if (el.theme) base.theme = el.theme
            if (!base.outline) base.outline = {width: 1, style: 'solid', color: '#D1D5DB'}
            break
        }
        case 'chart': {
            if (!CHART_TYPES.includes(el.chartType)) return null
            const d = el.data
            if (!d || !Array.isArray(d.labels) || !d.labels.length || !Array.isArray(d.series) || !d.series.length || !Array.isArray(d.series[0])) return null
            base.chartType = el.chartType
            base.data = {
                labels: d.labels.map(String),
                legends: Array.isArray(d.legends) ? d.legends.map(String) : ['系列1'],
                series: d.series.map(s => (Array.isArray(s) ? s : []).map(v => num(v, 0))),
            }
            if (['bar', 'column', 'line', 'area', 'radar'].includes(base.chartType)) {
                base.data.series = base.data.series.map(s => {
                    while (s.length < base.data.labels.length) s.push(0)
                    return s.slice(0, base.data.labels.length)
                })
                while (base.data.legends.length < base.data.series.length) base.data.legends.push(`系列${base.data.legends.length + 1}`)
                base.data.legends = base.data.legends.slice(0, base.data.series.length)
            }
            if (['pie', 'ring'].includes(base.chartType)) {
                base.data.series = [base.data.series[0].slice(0, base.data.labels.length)]
            }
            if (base.chartType === 'scatter') {
                base.data.series = base.data.series.slice(0, 2)
            }
            base.themeColors = Array.isArray(el.themeColors) && el.themeColors.filter(isColor).length ? el.themeColors.filter(isColor) : ['#1D4ED8', '#60A5FA', '#93C5FD', '#BFDBFE']
            if (isColor(el.textColor)) base.textColor = el.textColor
            if (isColor(el.lineColor)) base.lineColor = el.lineColor
            if (isColor(el.fill)) base.fill = el.fill
            break
        }
    }
    return base
}

function sanitizeSlide(raw, usedSlideIds) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.elements)) return null
    let id = typeof raw.id === 'string' && raw.id ? raw.id : `slide_${tools.getUUID().substring(0, 10)}`
    while (usedSlideIds.has(id)) id = `slide_${tools.getUUID().substring(0, 10)}`
    usedSlideIds.add(id)
    const elements = []
    const usedElIds = new Set()
    for (const el of raw.elements) {
        const s = sanitizeElement(el)
        if (!s) continue
        while (usedElIds.has(s.id)) s.id = `el_${tools.getUUID().substring(0, 8)}`
        usedElIds.add(s.id)
        elements.push(s)
    }
    if (elements.length < 2) return null
    return {id, background: sanitizeBackground(raw.background), elements}
}

/*---------------- 搜图换真实URL ----------------*/

/*按元素框与图片原始比例计算居中裁剪区间*/
function fitImageClip(elW, elH, imgW, imgH) {
    if (!imgW || !imgH) return null
    const boxRatio = elW / elH
    const imgRatio = imgW / imgH
    if (Math.abs(boxRatio - imgRatio) / imgRatio < 0.05) return null
    if (imgRatio > boxRatio) {
        const keep = boxRatio / imgRatio
        const cut = (1 - keep) / 2 * 100
        return {shape: 'rect', range: [[round2(cut), 0], [round2(100 - cut), 100]]}
    }
    const keep = imgRatio / boxRatio
    const cut = (1 - keep) / 2 * 100
    return {shape: 'rect', range: [[0, round2(cut)], [100, round2(100 - cut)]]}
}

/*为图片元素搜索并填充真实src；失败降级为装饰形状*/
async function resolveSlideImages(slide, palette) {
    const images = slide.elements.filter(e => e.type === 'image')
    for (const el of images) {
        if (el.src) continue
        const query = (typeof el.query === 'string' && el.query.trim()) || 'business presentation'
        let picked = null
        try {
            const ret = await proxyImgSearch({query, per_page: 5, page: 1})
            const list = (ret?.data || []).filter(i => i?.src)
            if (list.length) picked = list[Math.floor(Math.random() * Math.min(3, list.length))]
        } catch (e) {
            logger.warn('直出模式搜图失败(%s): %s', query, e.message || e)
        }
        if (picked) {
            el.src = picked.src
            el.description = el.description || query
            const clip = fitImageClip(el.width, el.height, picked.width, picked.height)
            if (clip) el.clip = clip
        } else {
            /*降级：图片位换成主题色圆角矩形*/
            const idx = slide.elements.indexOf(el)
            const r = Math.min(24, el.width / 8, el.height / 8)
            slide.elements[idx] = {
                type: 'shape',
                id: el.id,
                left: el.left,
                top: el.top,
                width: el.width,
                height: el.height,
                rotate: 0,
                viewBox: [el.width, el.height],
                path: `M ${r} 0 L ${el.width - r} 0 Q ${el.width} 0 ${el.width} ${r} L ${el.width} ${el.height - r} Q ${el.width} ${el.height} ${el.width - r} ${el.height} L ${r} ${el.height} Q 0 ${el.height} 0 ${el.height - r} L 0 ${r} Q 0 0 ${r} 0 Z`,
                fill: palette[(Math.random() * palette.length) | 0] || '#E8EEF9',
                opacity: 0.9,
            }
        }
    }
    for (const el of slide.elements) delete el.query
}

/*---------------- 排版体检 ----------------*/

function getTextRect(el) {
    return {x: el.left, y: el.top, w: el.width || 0, h: el.height || 0}
}

function estimateTextHeight(el) {
    const content = el.content || ''
    const fsList = [...content.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => parseFloat(m[1]))
    const sizes = fsList.length ? fsList : [16]
    const plain = content.replace(/<[^>]+>/g, '')
    const blocks = content.split(/<\/?(?:p|li|h\d)>/).filter(b => b.trim())
    let height = 8
    const blocks_ = blocks.length ? blocks : [plain]
    for (const b of blocks_) {
        let size = 16
        const m = b.match(/font-size:\s*(\d+(?:\.\d+)?)px/)
        if (m) size = parseFloat(m[1])
        else size = sizes[0]
        const text = b.replace(/<[^>]+>/g, '')
        let units = 0
        for (const ch of text) units += /[^\x00-\xff]/.test(ch) ? 1 : 0.55
        const perLine = Math.max(1, Math.floor(el.width / size))
        const lines = Math.max(1, Math.ceil(units / perLine))
        const lh = typeof el.lineHeight === 'number' ? el.lineHeight : 1.5
        height += lines * size * lh + (typeof el.paragraphSpace === 'number' ? el.paragraphSpace : 0)
    }
    return height
}

function rectOverlap(a, b) {
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
    return x * y
}

export function layoutLint(slide, pageType) {
    const issues = []
    const texts = slide.elements.filter(e => e.type === 'text')
    let hasVisual = false
    for (const el of slide.elements) {
        if (el.type === 'image' && el.src) hasVisual = true
        if (['chart', 'table'].includes(el.type)) hasVisual = true
        if (el.type === 'shape' && el.width >= 60 && el.height >= 60 && el.width < CANVAS_WIDTH * 0.95) hasVisual = true
        const r = el.type === 'line' ? {x: el.left, y: el.top, w: Math.abs(el.end[0] - el.start[0]), h: Math.abs(el.end[1] - el.start[1])} : getTextRect(el)
        if (r.x + r.w > CANVAS_WIDTH + 60 || r.y + r.h > CANVAS_HEIGHT + 60) issues.push(`元素${el.id}超出画布边界，请调整坐标或尺寸`)
        if (el.type === 'text') {
            const need = estimateTextHeight(el)
            if (need > el.height * 1.2) issues.push(`文本元素${el.id}可能溢出（需约${Math.round(need)}px，实际${el.height}px）：请精简该处文案字数，或增大height、减小字号`)
        }
    }
    for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
            const a = getTextRect(texts[i])
            const b = getTextRect(texts[j])
            const inter = rectOverlap(a, b)
            const minArea = Math.min(a.w * a.h, b.w * b.h)
            if (minArea > 0 && inter / minArea > 0.6) issues.push(`文本元素${texts[i].id}与${texts[j].id}大面积重叠，请重新安排位置`)
        }
    }
    if (pageType === 'content') {
        const totalText = texts.reduce((acc, el) => acc + (el.content || '').replace(/<[^>]+>/g, '').length, 0)
        if (!hasVisual || slide.elements.length < 3 || totalText > 420) issues.push('本页过于单调：请增加视觉锚点（卡片形状组/图片/图表/大数字），并将正文精简为要点式短语')
    }
    return {ok: issues.length === 0, issues}
}

/*---------------- 单页生成 ----------------*/

async function genOneSlide(plan, pageIndex, fileText, options) {
    const pageSpec = plan.pages[pageIndex]
    let feedback = ''
    let lastSlide = null
    for (let attempt = 0; attempt < 2; attempt++) {
        const userPrompt = buildSlideUserPrompt(plan, pageIndex, fileText)
            + (feedback ? `\n## 上一版存在以下排版问题，本次必须修复\n${feedback}` : '')
        let content
        try {
            content = await callLLM([
                {role: 'system', content: buildSlideSysPrompt(plan.design, pageSpec)},
                {role: 'user', content: userPrompt},
            ], {model: options.model})
        } catch (e) {
            logger.warn('直出模式第%s页LLM调用失败: %s', pageIndex + 1, e.message || e)
            continue
        }
        const raw = parseJSONText(content)
        const slide = raw && sanitizeSlide(raw, new Set())
        if (!slide) {
            feedback = '上一版输出无法解析为合法的Slide JSON（必须包含elements数组）。请只输出一个JSON对象。'
            continue
        }
        lastSlide = slide
        const lint = layoutLint(slide, pageSpec.type)
        if (lint.ok || attempt === 1) {
            slide._lintIssues = lint.issues
            return slide
        }
        feedback = lint.issues.join('；')
    }
    if (lastSlide) lastSlide._lintIssues = lastSlide._lintIssues || ['unresolved']
    return lastSlide
}

/*---------------- 主流程 ----------------*/

/**
 * @description AI直出模式：根据主题/材料直接生成pptist最终课件数据
 * @param {String} subject PPT主题
 * @param {Object} [options] 处理选项 {language, fileInfo, model, stream, streamCallback, concurrency}
 * @returns {Promise<Object|String>} 非流式返回完整课件对象；流式返回'done'（数据经streamCallback按JSONL行推送）
 */
export async function genPPTDirect(subject, options = {}) {
    const emit = (obj) => {
        if (options.streamCallback) options.streamCallback(`${JSON.stringify(obj)}\n\n`)
    }

    emit({kind: 'stage', stage: 'plan', message: 'AI 正在构思大纲与版式设计…'})
    const {plan, fileText} = await genPPTDirectPlan(subject, options)

    const theme = {
        backgroundColor: plan.design.backgroundColor,
        themeColors: plan.design.palette,
        fontColor: plan.design.fontColor,
        fontName: plan.design.fontName,
    }
    const total = plan.pages.length
    emit({kind: 'meta', title: plan.title, theme, viewportSize: CANVAS_WIDTH, viewportRatio: VIEWPORT_RATIO, total, design: plan.design})

    /*并发受控 + 按序输出*/
    const concurrency = options.concurrency || 3
    const usedSlideIds = new Set()
    const results = new Array(total)
    const stats = {dropped: 0, lintPass: 0, lintWarn: 0}
    let nextGen = 0
    let nextFlush = 0

    async function flushReady() {
        while (nextFlush < total && results[nextFlush] !== undefined) {
            const slide = results[nextFlush]
            const idx = nextFlush
            nextFlush++
            if (slide) {
                delete slide._pageType
                const issues = slide._lintIssues || []
                delete slide._lintIssues
                if (issues.length) stats.lintWarn++
                else stats.lintPass++
                emit({kind: 'slide', index: idx, total, data: slide})
                emit({kind: 'stage', stage: 'slide', index: idx + 1, total, message: `已完成第 ${idx + 1}/${total} 页`})
            } else {
                stats.dropped++
            }
        }
    }

    async function worker() {
        while (true) {
            const i = nextGen++
            if (i >= total) break
            const pageSpec = plan.pages[i]
            let slide = null
            try {
                slide = await genOneSlide(plan, i, fileText, options)
                if (slide) {
                    slide._pageType = pageSpec.type
                    /*重新走一遍全局id去重*/
                    const dedup = sanitizeSlide(slide, usedSlideIds)
                    if (dedup) {
                        dedup._lintIssues = slide._lintIssues
                        slide = dedup
                        await resolveSlideImages(slide, plan.design.palette)
                        const before = (slide._lintIssues || []).length
                        const lint = layoutLint(slide, pageSpec.type)
                        if (!lint.ok && before === 0) slide._lintIssues = lint.issues
                    } else {
                        slide = null
                    }
                }
            } catch (e) {
                logger.error('直出模式生成第%s页异常: %s', i + 1, e.message || e)
                slide = null
            }
            results[i] = slide
            await flushReady()
        }
    }

    emit({kind: 'stage', stage: 'content', message: 'AI 正在逐页设计课件版式…'})
    await Promise.all(Array.from({length: Math.min(concurrency, total)}, () => worker()))
    await flushReady()

    const slides = results.filter(Boolean)
    emit({kind: 'done', title: plan.title, theme, viewportSize: CANVAS_WIDTH, viewportRatio: VIEWPORT_RATIO, stats})
    if (!options.stream) {
        return {title: plan.title, theme, slides, viewportSize: CANVAS_WIDTH, viewportRatio: VIEWPORT_RATIO, stats}
    }
    return 'done'
}

/*获取直出模式生成PPT的任务*/
export async function getAgentTaskForPPTDirect(subject, options = {}) {
    return {
        agentCode: tools.getUUID(),
        title: `直出模式生成课件-${subject || ''}`,
        agentType: 'sequential',
        handler: 'sequentialDispatch',
        handleMode: options.handleMode || 'manual',
        subAgents: [{
            title: '直出模式生成课件',
            agentType: 'grpc',
            handler: 'grpcCall',
            params: {
                grpcHost: config.grpcHost,
                grpcHandler: 'pptDirectCompose',
                subject,
                language: options.language,
                fileInfo: options.fileInfo,
                pptCode: options.pptCode,
                pptTitle: options.pptTitle,
                operator: options.operator,
            },
            handleMode: options.handleMode || 'manual',
            toParentOutputKey: 'pptMeta',
        }]
    }
}
