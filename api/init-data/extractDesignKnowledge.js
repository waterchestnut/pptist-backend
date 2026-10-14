/**
 * @fileOverview 从内置专业模板中提取AI直出模式的设计知识库（版式图谱/字号阶梯/装饰规律/黄金样例）
 * @author xianyang
 * @module
 */

import '../init.js'
import fs from 'fs'

const baseDir = pptonline.baseDir

const CANVAS_WIDTH = 1000
const CANVAS_HEIGHT = 562.5
const ALLOWED_TYPES = ['text', 'image', 'shape', 'line', 'table', 'chart']

const LAYOUT_META = {
    'cover-center': {name: '居中式封面', description: '页面中央大标题（40~54px）+ 副标题/演讲人信息，背景由整幅图片、大色块或几何装饰构成'},
    'cover-split': {name: '左右分栏封面', description: '封面左右一侧为大色块或整幅图片，另一侧排布主标题与副标题文字'},
    'contents-list': {name: '目录页', description: '4~8个目录条目纵向或网格排布，条目含编号形状（圆/方块/胶囊）+ 章节标题文本'},
    'transition-number': {name: '章节过渡页', description: '超大节编号（80~160px或装饰形状）+ 章节标题，常配大色块/大圆形装饰'},
    'split-image-left': {name: '左图右文页', description: '左侧约1/3版面为大幅图片（通高或近通高），右侧为标题+正文/条目区'},
    'split-image-right': {name: '右图左文页', description: '右侧约1/3版面为大幅图片，左侧为标题+正文/条目区'},
    'image-top': {name: '上图下文页', description: '上半部为大图或图片+色带，下半部为标题与正文'},
    'full-image': {name: '全图金句页', description: '整幅背景图（1000x562.5）+ 半透明色块或描边形状衬托一句主旨文字'},
    'cards-2': {name: '双卡片页', description: '2个等尺寸卡片形状（圆角矩形+阴影）横向并排，每卡片含图标/形状、小标题与正文'},
    'cards-3': {name: '三卡片页', description: '3个等尺寸卡片形状横向并排（或2+1错位），每卡片含编号/图标、小标题与正文'},
    'cards-4': {name: '四宫格页', description: '4个等尺寸卡片呈2x2网格排布，每卡片含小标题与正文'},
    'cards-5': {name: '五卡片页', description: '5个卡片呈上3下2或横向5列排布'},
    'cards-6': {name: '六宫格页', description: '6个卡片呈2行x3列网格排布'},
    'list-rows': {name: '条目列表页', description: '3~6个条目纵向排布，每条含编号形状/图标 + 标题 + 正文，条目间用细线或色块分隔'},
    'timeline': {name: '时间轴/流程页', description: '一条主线条（line或细长shape）贯穿页面，沿线分布3~6个节点（圆/胶囊shape + 文本）'},
    'title-bullets': {name: '标题+要点页', description: '顶部标题 + 大段正文或多段列表文本，无图片'},
    'big-number': {name: '大数字页', description: '超大数字文本（48~96px）+ 简短说明，常配色块底衬'},
    'data-chart': {name: '图表页', description: '1~2个chart元素为视觉主体 + 标题 + 简要结论文本'},
    'data-table': {name: '表格页', description: '1个table元素为主体 + 标题 + 说明文本'},
}

/*获取元素包围盒（line用start/end换算）*/
function getRect(el) {
    if (el.type === 'line') {
        const x1 = el.left + Math.min(el.start[0], el.end[0])
        const y1 = el.top + Math.min(el.start[1], el.end[1])
        const w = Math.abs(el.end[0] - el.start[0]) || 2
        const h = Math.abs(el.end[1] - el.start[1]) || 2
        return {x: x1, y: y1, w, h}
    }
    return {x: el.left || 0, y: el.top || 0, w: el.width || 0, h: el.height || 0}
}

/*按类型统计元素*/
function typeCount(elements) {
    const c = {}
    for (const el of elements) c[el.type] = (c[el.type] || 0) + 1
    return c
}

/*提取文本元素内联字号*/
function getFontSizes(el) {
    const ret = []
    const content = el.type === 'text' ? el.content : el?.text?.content
    if (!content) return ret
    const re = /font-size:\s*(\d+(?:\.\d+)?)px/g
    let m
    while ((m = re.exec(content)) !== null) ret.push(parseFloat(m[1]))
    return ret
}

/*检测等大卡片组：按groupId聚组，组内既有shape又有text，组数>=2且各组高度相近、纵向重叠或成网格*/
function detectCardGroups(slide) {
    const groups = {}
    for (const el of slide.elements) {
        if (!el.groupId) continue
        if (!groups[el.groupId]) groups[el.groupId] = []
        groups[el.groupId].push(el)
    }
    const cardGroups = Object.values(groups).filter(g => {
        const t = typeCount(g)
        return (t.text || 0) >= 1 && ((t.shape || 0) >= 1 || (t.image || 0) >= 1) && g.length >= 2
    })
    if (cardGroups.length < 2) return null
    const rects = cardGroups.map(g => {
        const rs = g.map(getRect)
        const x1 = Math.min(...rs.map(r => r.x))
        const y1 = Math.min(...rs.map(r => r.y))
        const x2 = Math.max(...rs.map(r => r.x + r.w))
        const y2 = Math.max(...rs.map(r => r.y + r.h))
        return {x: x1, y: y1, w: x2 - x1, h: y2 - y1}
    })
    const hs = rects.map(r => r.h)
    const ws = rects.map(r => r.w)
    const similar = (arr) => (Math.max(...arr) - Math.min(...arr)) / Math.max(...arr) < 0.25
    if (!similar(hs) || !similar(ws)) return null
    return {count: cardGroups.length, rects}
}

/*判断卡片组排布：同行/网格*/
function cardGridRows(rects) {
    const ys = [...new Set(rects.map(r => Math.round(r.y / 40)))].sort()
    const rows = new Set()
    for (const r of rects) rows.add(Math.round((r.y + r.h / 2) / 140))
    return Math.max(1, rows.size)
}

/*版式分类*/
function classifyLayout(slide) {
    const els = slide.elements
    const pageType = slide.type || 'content'
    const counts = typeCount(els)
    if (counts.chart) return 'data-chart'
    if (counts.table) return 'data-table'

    const images = els.filter(e => e.type === 'image').map(getRect)
    const bigImgs = images.filter(r => r.w >= 260 && r.h >= 200)
    const fullImgs = images.filter(r => r.w >= CANVAS_WIDTH * 0.9 && r.h >= CANVAS_HEIGHT * 0.85)

    const cards = detectCardGroups(slide)
    if (pageType === 'content' && cards && cards.count >= 2 && !bigImgs.length) {
        const key = `cards-${Math.min(6, cards.count)}`
        if (LAYOUT_META[key]) return key
    }
    const textEls = els.filter(e => e.type === 'text')
    const totalFontSize = textEls.flatMap(e => getFontSizes(e))
    if (pageType === 'content' && totalFontSize.some(f => f >= 44) && textEls.length <= 6) return 'big-number'

    if (pageType === 'cover') {
        const hasSideBlock = [...bigImgs, ...els.filter(e => e.type === 'shape').map(getRect)]
            .some(r => (r.w >= 300 && r.h >= CANVAS_HEIGHT * 0.8) && (r.x <= 20 || r.x + r.w >= CANVAS_WIDTH - 20))
        return hasSideBlock ? 'cover-split' : 'cover-center'
    }
    if (pageType === 'contents') return 'contents-list'
    if (pageType === 'transition') return 'transition-number'
    if (pageType === 'end') return els.some(e => e.type === 'image') ? 'full-image' : 'cover-center'

    if (fullImgs.length && textEls.length <= 4) return 'full-image'
    if (bigImgs.length) {
        const r = bigImgs[0]
        const cx = r.x + r.w / 2
        if (r.h >= CANVAS_HEIGHT * 0.7 && cx < CANVAS_WIDTH * 0.42) return 'split-image-left'
        if (r.h >= CANVAS_HEIGHT * 0.7 && cx > CANVAS_WIDTH * 0.58) return 'split-image-right'
        if (r.y + r.h / 2 < CANVAS_HEIGHT * 0.5) return 'image-top'
    }
    const lines = els.filter(e => e.type === 'line').map(getRect)
    if (cards && cards.count >= 2) return 'list-rows'
    const longLine = lines.find(l => l.w >= 400 && l.h < 6)
    const numbered = textEls.some(e => getRect(e).h <= 60 && /0?1|一|壹/.test(e.content || ''))
    if (longLine && cards) return 'list-rows'
    if (numbered && els.length >= 8 && !cards && counts.shape >= 3) return 'timeline'
    if (counts.shape >= 6 && textEls.length >= 6) return 'list-rows'
    if (pageType === 'content' && cards) return 'list-rows'
    if (textEls.length <= 3) return 'title-bullets'
    return 'title-bullets'
}

/*清洗为直出格式的黄金样例*/
function toGoldenSlide(slide) {
    const keepRect = (el) => {
        const base = {type: el.type, id: el.id, left: el.left, top: el.top, rotate: el.rotate || 0}
        if (el.type === 'line') {
            return {...base, start: el.start, end: el.end, width: el.width, style: el.style, color: el.color, points: el.points}
        }
        base.width = el.width
        base.height = el.height
        if (el.type === 'text') {
            Object.assign(base, {
                content: el.content,
                defaultFontName: el.defaultFontName || '',
                defaultColor: el.defaultColor || '#333',
            })
            if (el.lineHeight !== undefined) base.lineHeight = el.lineHeight
            if (el.paragraphSpace !== undefined) base.paragraphSpace = el.paragraphSpace
            if (el.fill) base.fill = el.fill
            if (el.textType) base.textType = el.textType
        } else if (el.type === 'image') {
            base.src = ''
            base.description = el.description || '（图片位：生成时以空src与英文query关键词替换）'
            base.query = 'business meeting'
            if (el.radius !== undefined) base.radius = el.radius
            if (el.clip) base.clip = el.clip
            if (el.filters) base.filters = el.filters
            if (el.outline) base.outline = el.outline
            if (el.shadow) base.shadow = el.shadow
        } else if (el.type === 'shape') {
            Object.assign(base, {viewBox: el.viewBox, path: el.path, fill: el.fill})
            if (el.gradient) base.gradient = el.gradient
            if (el.outline) base.outline = el.outline
            if (el.shadow) base.shadow = el.shadow
            if (el.opacity !== undefined && el.opacity !== 1) base.opacity = el.opacity
            if (el.text) {
                base.text = {
                    content: el.text.content,
                    defaultFontName: el.text.defaultFontName || '',
                    defaultColor: el.text.defaultColor || '#333',
                    align: el.text.align || 'middle',
                }
                if (el.text.lineHeight !== undefined) base.text.lineHeight = el.text.lineHeight
            }
        } else if (el.type === 'table') {
            Object.assign(base, {colWidths: el.colWidths, cellMinHeight: el.cellMinHeight, data: el.data, outline: el.outline})
            if (el.theme) base.theme = el.theme
        } else if (el.type === 'chart') {
            Object.assign(base, {chartType: el.chartType, data: el.data, themeColors: el.themeColors})
            if (el.textColor) base.textColor = el.textColor
            if (el.lineColor) base.lineColor = el.lineColor
            if (el.fill) base.fill = el.fill
        }
        return base
    }
    return {
        id: slide.id,
        background: slide.background || {type: 'solid', color: '#FFFFFF'},
        elements: slide.elements.map(keepRect),
    }
}

function median(arr) {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function quantile(arr, q) {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
}

function extract() {
    const data = fs.readFileSync(`${baseDir}init-data/cache/tmpl.json`, 'utf-8')
    const tmplList = JSON.parse(data)

    const layouts = {}
    const fontLadder = {}
    const decorations = {topBand: 0, bottomBand: 0, sideBand: 0, dividerLine: 0, cornerMark: 0, total: 0}
    const palettes = []
    const candidates = {}

    for (const tmpl of tmplList) {
        if (tmpl.theme?.themeColors?.length) {
            palettes.push({
                template: tmpl.pptCode,
                title: tmpl.title,
                themeColors: tmpl.theme.themeColors,
                backgroundColor: tmpl.theme.backgroundColor,
                fontColor: tmpl.theme.fontColor,
            })
        }
        for (const slide of tmpl.slides || []) {
            const els = slide.elements || []
            if (!els.length || !slide.type) continue
            const key = classifyLayout(slide)
            const meta = LAYOUT_META[key] || {name: key, description: key}

            const rec = layouts[key] = layouts[key] || {key, name: meta.name, description: meta.description, frequency: 0, pageTypes: {}, elementRatio: {}, elementCountSum: 0}
            rec.frequency++
            rec.pageTypes[slide.type] = (rec.pageTypes[slide.type] || 0) + 1
            rec.elementCountSum += els.length
            const c = typeCount(els)
            for (const t in c) rec.elementRatio[t] = (rec.elementRatio[t] || 0) + c[t]

            for (const el of els) {
                for (const f of getFontSizes(el)) {
                    const tk = el.textType || (el.type === 'shape' ? 'shapeText' : 'unknown')
                    fontLadder[tk] = fontLadder[tk] || []
                    fontLadder[tk].push(f)
                }
            }

            const rects = els.map(getRect)
            if (rects.some(r => r.w >= 800 && r.h <= 200 && r.y <= 150)) decorations.topBand++
            if (rects.some(r => r.w >= 800 && r.y >= CANVAS_HEIGHT - 150)) decorations.bottomBand++
            if (rects.some(r => r.w <= 200 && r.h >= 350)) decorations.sideBand++
            if (els.some(e => e.type === 'line' && (getRect(e).w >= 300 || getRect(e).h >= 200))) decorations.dividerLine++
            if (els.some(e => e.type === 'shape' && getRect(e).w <= 60 && getRect(e).h <= 60 && (getRect(e).y <= 80 || getRect(e).y >= CANVAS_HEIGHT - 80))) decorations.cornerMark++
            decorations.total++

            const allowed = els.every(e => ALLOWED_TYPES.includes(e.type))
            if (allowed && els.length >= 4 && els.length <= 16) {
                candidates[key] = candidates[key] || []
                candidates[key].push({tmpl: tmpl.pptCode, slide})
            }
        }
    }

    for (const key in layouts) {
        const rec = layouts[key]
        rec.avgElementCount = Math.round(rec.elementCountSum / rec.frequency * 10) / 10
        for (const t in rec.elementRatio) rec.elementRatio[t] = Math.round(rec.elementRatio[t] / rec.frequency * 100) / 100
        delete rec.elementCountSum
    }

    const goldenSlides = []
    for (const key in candidates) {
        const list = candidates[key].sort((a, b) => b.slide.elements.length - a.slide.elements.length)
        const pick = list[Math.min(1, list.length - 1)] || list[0]
        goldenSlides.push({
            layoutKey: key,
            pageType: pick.slide.type,
            sourceTemplate: pick.tmpl,
            slide: toGoldenSlide(pick.slide),
        })
    }

    const typography = {}
    for (const tk in fontLadder) {
        typography[tk] = {median: median(fontLadder[tk]), p25: quantile(fontLadder[tk], 0.25), p75: quantile(fontLadder[tk], 0.75), samples: fontLadder[tk].length}
    }

    const decorationPatterns = {}
    for (const k of ['topBand', 'bottomBand', 'sideBand', 'dividerLine', 'cornerMark']) {
        decorationPatterns[k] = Math.round(decorations[k] / decorations.total * 100) / 100
    }

    const out = {
        generatedAt: new Date().toISOString(),
        source: 'init-data/cache/tmpl.json',
        stats: {
            templates: tmplList.length,
            slides: decorations.total,
        },
        layouts: Object.values(layouts).sort((a, b) => b.frequency - a.frequency),
        typography,
        decorationPatterns,
        palettes,
        goldenSlides,
    }

    const outPath = `${baseDir}services/core/prompts/design-knowledge.json`
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')
    console.log(`版式种类: ${out.layouts.length}, 黄金样例: ${goldenSlides.length}, 页数: ${decorations.total}`)
    console.log(out.layouts.map(l => `${l.key}:${l.frequency}`).join(', '))
}

extract()

console.log('done')
