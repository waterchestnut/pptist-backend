import fetch from 'node-fetch'
import pptxtojson from 'pptxtojson/dist/index.cjs'
import {SVGPathData} from 'svg-pathdata'
import {SHAPE_LIST, SHAPE_PATH_FORMULAS} from '../../types/shapes.js'
import {chromium} from 'playwright'
import {getDocHttpUrl, uploadFromDataUrl} from './fileInfo.js'

class BrowserHandler {
    async init() {
        this._browser = await chromium.launch({headless: true})
        this._page = await this._browser.newPage()
    }

    async clean() {
        await this._page.close()
        await this._browser.close()
    }

    async getTableCell(cellData, ratio, defaultStyle) {
        return this._page.evaluate(({cellData, ratio, defaultStyle}) => {
            let textDiv = document.createElement('div')
            textDiv.innerHTML = cellData.text

            const p = textDiv.querySelector('p')
            const align = p?.style.textAlign || 'left'

            const span = textDiv.querySelector('span')
            const fontsize = span?.style.fontSize ? (parseInt(span?.style.fontSize) * ratio).toFixed(1) + 'px' : ''
            const fontname = span?.style.fontFamily || ''
            const color = span?.style.color || cellData.fontColor

            let data = {
                colspan: cellData.colSpan || 1,
                rowspan: cellData.rowSpan || 1,
                text: textDiv.innerText,
                style: {
                    ...defaultStyle,
                    align: ['left', 'right', 'center'].includes(align) ? align : 'left',
                    fontsize,
                    fontname,
                    color,
                    bold: cellData.fontBold,
                    backcolor: cellData.fillColor,
                },
            }
            textDiv = null
            return data
        }, {cellData, ratio, defaultStyle})
    }
}

const defaultTheme = {
    themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
    fontColor: '#333',
    fontName: '',
}

const nanoid = (len = 32) => {
    return pptonline.tools.getUUID4().substring(0, len - 1)
}

const convertFontSizePtToPx = (html, ratio) => {
    return html.replace(/font-size:\s*([\d.]+)pt/g, (match, p1) => {
        return `font-size: ${(parseFloat(p1) * ratio).toFixed(1)}px`
    })
}

const rotateLine = (line, angleDeg) => {
    const {start, end} = line

    const angleRad = angleDeg * Math.PI / 180

    const midX = (start[0] + end[0]) / 2
    const midY = (start[1] + end[1]) / 2

    const startTransX = start[0] - midX
    const startTransY = start[1] - midY
    const endTransX = end[0] - midX
    const endTransY = end[1] - midY

    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

    const startRotX = startTransX * cosA - startTransY * sinA
    const startRotY = startTransX * sinA + startTransY * cosA

    const endRotX = endTransX * cosA - endTransY * sinA
    const endRotY = endTransX * sinA + endTransY * cosA

    const startNewX = startRotX + midX
    const startNewY = startRotY + midY
    const endNewX = endRotX + midX
    const endNewY = endRotY + midY

    const beforeMinX = Math.min(start[0], end[0])
    const beforeMinY = Math.min(start[1], end[1])

    const afterMinX = Math.min(startNewX, endNewX)
    const afterMinY = Math.min(startNewY, endNewY)

    const startAdjustedX = startNewX - afterMinX
    const startAdjustedY = startNewY - afterMinY
    const endAdjustedX = endNewX - afterMinX
    const endAdjustedY = endNewY - afterMinY

    const startAdjusted = [startAdjustedX, startAdjustedY]
    const endAdjusted = [endAdjustedX, endAdjustedY]
    const offset = [afterMinX - beforeMinX, afterMinY - beforeMinY]

    return {
        start: startAdjusted,
        end: endAdjusted,
        offset,
    }
}

const parseLineElement = (el, ratio) => {
    let start = [0, 0]
    let end = [0, 0]

    if (!el.isFlipV && !el.isFlipH) { // 右下
        start = [0, 0]
        end = [el.width, el.height]
    } else if (el.isFlipV && el.isFlipH) { // 左上
        start = [el.width, el.height]
        end = [0, 0]
    } else if (el.isFlipV && !el.isFlipH) { // 右上
        start = [0, el.height]
        end = [el.width, 0]
    } else { // 左下
        start = [el.width, 0]
        end = [0, el.height]
    }

    const data = {
        type: 'line',
        id: nanoid(10),
        width: +((el.borderWidth || 1) * ratio).toFixed(2),
        left: el.left,
        top: el.top,
        start,
        end,
        style: el.borderType,
        color: el.borderColor,
        points: ['', /straightConnector/.test(el.shapType) ? 'arrow' : '']
    }
    if (el.rotate) {
        const {start, end, offset} = rotateLine(data, el.rotate)

        data.start = start
        data.end = end
        data.left = data.left + offset[0]
        data.top = data.top + offset[1]
    }
    if (/bentConnector/.test(el.shapType)) {
        data.broken2 = [
            Math.abs(data.start[0] - data.end[0]) / 2,
            Math.abs(data.start[1] - data.end[1]) / 2,
        ]
    }
    if (/curvedConnector/.test(el.shapType)) {
        const cubic = [
            Math.abs(data.start[0] - data.end[0]) / 2,
            Math.abs(data.start[1] - data.end[1]) / 2,
        ]
        data.cubic = [cubic, cubic]
    }

    return data
}

const flipGroupElements = (elements, axis) => {
    const minX = Math.min(...elements.map(el => el.left))
    const maxX = Math.max(...elements.map(el => el.left + el.width))
    const minY = Math.min(...elements.map(el => el.top))
    const maxY = Math.max(...elements.map(el => el.top + el.height))

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    return elements.map(element => {
        const newElement = {...element}

        if (axis === 'y') newElement.left = 2 * centerX - element.left - element.width
        if (axis === 'x') newElement.top = 2 * centerY - element.top - element.height

        return newElement
    })
}

const calculateRotatedPosition = (
    x,
    y,
    w,
    h,
    ox,
    oy,
    k,
) => {
    const radians = k * (Math.PI / 180)

    const containerCenterX = x + w / 2
    const containerCenterY = y + h / 2

    const relativeX = ox - w / 2
    const relativeY = oy - h / 2

    const rotatedX = relativeX * Math.cos(radians) + relativeY * Math.sin(radians)
    const rotatedY = -relativeX * Math.sin(radians) + relativeY * Math.cos(radians)

    const graphicX = containerCenterX + rotatedX
    const graphicY = containerCenterY + rotatedY

    return {x: graphicX, y: graphicY}
}

const getSvgPathRange = (path) => {
    try {
        const pathData = new SVGPathData(path)
        const xList = []
        const yList = []
        for (const item of pathData.commands) {
            const x = ('x' in item) ? item.x : 0
            const y = ('y' in item) ? item.y : 0
            xList.push(x)
            yList.push(y)
        }
        return {
            minX: Math.min(...xList),
            minY: Math.min(...yList),
            maxX: Math.max(...xList),
            maxY: Math.max(...yList),
        }
    } catch {
        return {
            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,
        }
    }
}

export async function convertPptxJsonToPptInfo(json, fileName, userInfo) {
    const shapeList = []
    for (const item of SHAPE_LIST) {
        shapeList.push(...item.children)
    }
    let ratio = 96 / 72
    let pptInfo = {
        title: fileName,
        theme: {
            themeColors: json.themeColors
        },
        slides: [],
        slideIndex: 0,
        viewportSize: json.size.width * ratio
    }
    let browserHandler = null
    if (json?.slides?.some(_s => _s?.elements?.some(_e => _e?.type === 'table'))) {
        browserHandler = new BrowserHandler()
        await browserHandler.init()
    }
    for (const item of json.slides) {
        const {type, value} = item.fill
        let background
        if (type === 'image') {
            background = {
                type: 'image',
                image: {
                    src: await uploadFromDataUrl(value.picBase64, userInfo),
                    size: 'cover',
                },
            }

        } else if (type === 'gradient') {
            background = {
                type: 'gradient',
                gradient: {
                    type: value.path === 'line' ? 'linear' : 'radial',
                    colors: value.colors.map(item => ({
                        ...item,
                        pos: parseInt(item.pos),
                    })),
                    rotate: value.rot + 90,
                },
            }
        } else {
            background = {
                type: 'solid',
                color: value || '#fff',
            }
        }

        const slide = {
            id: nanoid(10),
            elements: [],
            background,
            remark: item.note || '',
        }

        const parseElements = async (elements) => {
            const sortedElements = elements.sort((a, b) => a.order - b.order)

            for (const el of sortedElements) {
                const originWidth = el.width || 1
                const originHeight = el.height || 1
                const originLeft = el.left
                const originTop = el.top

                el.width = el.width * ratio
                el.height = el.height * ratio
                el.left = el.left * ratio
                el.top = el.top * ratio

                if (el.type === 'text') {
                    const textEl = {
                        type: 'text',
                        id: nanoid(10),
                        width: el.width,
                        height: el.height,
                        left: el.left,
                        top: el.top,
                        rotate: el.rotate,
                        defaultFontName: defaultTheme.fontName,
                        defaultColor: defaultTheme.fontColor,
                        content: convertFontSizePtToPx(el.content, ratio),
                        lineHeight: 1,
                        outline: {
                            color: el.borderColor,
                            width: +(el.borderWidth * ratio).toFixed(2),
                            style: el.borderType,
                        },
                        fill: el.fill.type === 'color' ? el.fill.value : '',
                        vertical: el.isVertical,
                    }
                    if (el.shadow) {
                        textEl.shadow = {
                            h: el.shadow.h * ratio,
                            v: el.shadow.v * ratio,
                            blur: el.shadow.blur * ratio,
                            color: el.shadow.color,
                        }
                    }
                    slide.elements.push(textEl)
                } else if (el.type === 'image') {
                    const element = {
                        type: 'image',
                        id: nanoid(10),
                        src: await uploadFromDataUrl(el.src, userInfo),
                        width: el.width,
                        height: el.height,
                        left: el.left,
                        top: el.top,
                        fixedRatio: true,
                        rotate: el.rotate,
                        flipH: el.isFlipH,
                        flipV: el.isFlipV,
                    }
                    if (el.borderWidth) {
                        element.outline = {
                            color: el.borderColor,
                            width: +(el.borderWidth * ratio).toFixed(2),
                            style: el.borderType,
                        }
                    }
                    const clipShapeTypes = ['roundRect', 'ellipse', 'triangle', 'rhombus', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'parallelogram', 'trapezoid']
                    if (el.rect) {
                        element.clip = {
                            shape: (el.geom && clipShapeTypes.includes(el.geom)) ? el.geom : 'rect',
                            range: [
                                [
                                    el.rect.l || 0,
                                    el.rect.t || 0,
                                ],
                                [
                                    100 - (el.rect.r || 0),
                                    100 - (el.rect.b || 0),
                                ],
                            ]
                        }
                    } else if (el.geom && clipShapeTypes.includes(el.geom)) {
                        element.clip = {
                            shape: el.geom,
                            range: [[0, 0], [100, 100]]
                        }
                    }
                    slide.elements.push(element)
                } else if (el.type === 'math') {
                    slide.elements.push({
                        type: 'image',
                        id: nanoid(10),
                        src: await uploadFromDataUrl(el.picBase64, userInfo),
                        width: el.width,
                        height: el.height,
                        left: el.left,
                        top: el.top,
                        fixedRatio: true,
                        rotate: 0,
                    })

                } else if (el.type === 'audio') {
                    slide.elements.push({
                        type: 'audio',
                        id: nanoid(10),
                        src: await uploadFromDataUrl(el.blob, userInfo),
                        width: el.width,
                        height: el.height,
                        left: el.left,
                        top: el.top,
                        rotate: 0,
                        fixedRatio: false,
                        color: defaultTheme.themeColors[0],
                        loop: false,
                        autoplay: false,
                    })
                } else if (el.type === 'video') {
                    slide.elements.push({
                        type: 'video',
                        id: nanoid(10),
                        src: el.blob ? (await uploadFromDataUrl(el.blob, userInfo)) : el.src ? el.src : '',
                        width: el.width,
                        height: el.height,
                        left: el.left,
                        top: el.top,
                        rotate: 0,
                        autoplay: false,
                    })
                } else if (el.type === 'shape') {
                    if (el.shapType === 'line' || /Connector/.test(el.shapType)) {
                        const lineElement = parseLineElement(el, ratio)
                        slide.elements.push(lineElement)
                    } else {
                        const shape = shapeList.find(item => item.pptxShapeType === el.shapType)

                        const vAlignMap = {
                            'mid': 'middle',
                            'down': 'bottom',
                            'up': 'top',
                        }

                        const gradient = el.fill?.type === 'gradient' ? {
                            type: el.fill.value.path === 'line' ? 'linear' : 'radial',
                            colors: el.fill.value.colors.map(item => ({
                                ...item,
                                pos: parseInt(item.pos),
                            })),
                            rotate: el.fill.value.rot,
                        } : undefined

                        const pattern = el.fill?.type === 'image' ? (await uploadFromDataUrl(el.fill.value.picBase64, userInfo)) : undefined

                        const fill = el.fill?.type === 'color' ? el.fill.value : ''

                        const element = {
                            type: 'shape',
                            id: nanoid(10),
                            width: el.width,
                            height: el.height,
                            left: el.left,
                            top: el.top,
                            viewBox: [200, 200],
                            path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
                            fill,
                            gradient,
                            pattern,
                            fixedRatio: false,
                            rotate: el.rotate,
                            outline: {
                                color: el.borderColor,
                                width: +(el.borderWidth * ratio).toFixed(2),
                                style: el.borderType,
                            },
                            text: {
                                content: convertFontSizePtToPx(el.content, ratio),
                                defaultFontName: defaultTheme.fontName,
                                defaultColor: defaultTheme.fontColor,
                                align: vAlignMap[el.vAlign] || 'middle',
                            },
                            flipH: el.isFlipH,
                            flipV: el.isFlipV,
                        }
                        if (el.shadow) {
                            element.shadow = {
                                h: el.shadow.h * ratio,
                                v: el.shadow.v * ratio,
                                blur: el.shadow.blur * ratio,
                                color: el.shadow.color,
                            }
                        }

                        if (shape) {
                            element.path = shape.path
                            element.viewBox = shape.viewBox

                            if (shape.pathFormula) {
                                element.pathFormula = shape.pathFormula
                                element.viewBox = [el.width, el.height]

                                const pathFormula = SHAPE_PATH_FORMULAS[shape.pathFormula]
                                if ('editable' in pathFormula && pathFormula.editable) {
                                    element.path = pathFormula.formula(el.width, el.height, pathFormula.defaultValue)
                                    element.keypoints = pathFormula.defaultValue
                                } else element.path = pathFormula.formula(el.width, el.height)
                            }
                        } else if (el.path && el.path.indexOf('NaN') === -1) {
                            const {maxX, maxY} = getSvgPathRange(el.path)
                            element.path = el.path
                            element.viewBox = [maxX || originWidth, maxY || originHeight]
                        }
                        if (el.shapType === 'custom') {
                            if (el.path?.indexOf('NaN') !== -1) element.path = ''
                            else {
                                element.special = true
                                element.path = el.path

                                const {maxX, maxY} = getSvgPathRange(element.path)
                                element.viewBox = [maxX || originWidth, maxY || originHeight]
                            }
                        }

                        if (element.path) slide.elements.push(element)
                    }
                } else if (el.type === 'table') {
                    const row = el.data.length
                    const col = el.data[0].length

                    const style = {
                        fontname: defaultTheme.fontName,
                        color: defaultTheme.fontColor,
                    }
                    const data = []
                    for (let i = 0; i < row; i++) {
                        const rowCells = []
                        for (let j = 0; j < col; j++) {
                            const cellData = el.data[i][j]
                            let textDiv = await browserHandler?.getTableCell(cellData, ratio, style)
                            rowCells.push({
                                ...textDiv,
                                id: nanoid(10),
                            })
                        }
                        data.push(rowCells)
                    }

                    const allWidth = el.colWidths.reduce((a, b) => a + b, 0)
                    const colWidths = el.colWidths.map(item => item / allWidth)

                    const firstCell = el.data[0][0]
                    const border = firstCell.borders.top ||
                        firstCell.borders.bottom ||
                        el.borders.top ||
                        el.borders.bottom ||
                        firstCell.borders.left ||
                        firstCell.borders.right ||
                        el.borders.left ||
                        el.borders.right
                    const borderWidth = border?.borderWidth || 0
                    const borderStyle = border?.borderType || 'solid'
                    const borderColor = border?.borderColor || '#eeece1'

                    slide.elements.push({
                        type: 'table',
                        id: nanoid(10),
                        width: el.width,
                        height: el.height,
                        left: el.left,
                        top: el.top,
                        colWidths,
                        rotate: 0,
                        data,
                        outline: {
                            width: +(borderWidth * ratio || 2).toFixed(2),
                            style: borderStyle,
                            color: borderColor,
                        },
                        cellMinHeight: el.rowHeights[0] ? el.rowHeights[0] * ratio : 36,
                    })
                } else if (el.type === 'chart') {
                    let labels
                    let legends
                    let series

                    if (el.chartType === 'scatterChart' || el.chartType === 'bubbleChart') {
                        labels = el.data[0].map((item, index) => `坐标${index + 1}`)
                        legends = ['X', 'Y']
                        series = el.data
                    } else {
                        const data = el.data
                        labels = Object.values(data[0].xlabels)
                        legends = data.map(item => item.key)
                        series = data.map(item => item.values.map(v => v.y))
                    }

                    const options = {}

                    let chartType = 'bar'

                    switch (el.chartType) {
                        case 'barChart':
                        case 'bar3DChart':
                            chartType = 'bar'
                            if (el.barDir === 'bar') chartType = 'column'
                            if (el.grouping === 'stacked' || el.grouping === 'percentStacked') options.stack = true
                            break
                        case 'lineChart':
                        case 'line3DChart':
                            if (el.grouping === 'stacked' || el.grouping === 'percentStacked') options.stack = true
                            chartType = 'line'
                            break
                        case 'areaChart':
                        case 'area3DChart':
                            if (el.grouping === 'stacked' || el.grouping === 'percentStacked') options.stack = true
                            chartType = 'area'
                            break
                        case 'scatterChart':
                        case 'bubbleChart':
                            chartType = 'scatter'
                            break
                        case 'pieChart':
                        case 'pie3DChart':
                            chartType = 'pie'
                            break
                        case 'radarChart':
                            chartType = 'radar'
                            break
                        case 'doughnutChart':
                            chartType = 'ring'
                            break
                        default:
                    }

                    slide.elements.push({
                        type: 'chart',
                        id: nanoid(10),
                        chartType: chartType,
                        width: el.width,
                        height: el.height,
                        left: el.left,
                        top: el.top,
                        rotate: 0,
                        themeColors: el.colors.length ? el.colors : defaultTheme.themeColors,
                        textColor: defaultTheme.fontColor,
                        data: {
                            labels,
                            legends,
                            series,
                        },
                        options,
                    })
                } else if (el.type === 'group') {
                    let elements = el.elements.map(_el => {
                        let left = _el.left + originLeft
                        let top = _el.top + originTop

                        if (el.rotate) {
                            const {
                                x,
                                y
                            } = calculateRotatedPosition(originLeft, originTop, originWidth, originHeight, _el.left, _el.top, el.rotate)
                            left = x
                            top = y
                        }

                        const element = {
                            ..._el,
                            left,
                            top,
                        }
                        if (el.isFlipH && 'isFlipH' in element) element.isFlipH = true
                        if (el.isFlipV && 'isFlipV' in element) element.isFlipV = true

                        return element
                    })
                    if (el.isFlipH) elements = flipGroupElements(elements, 'y')
                    if (el.isFlipV) elements = flipGroupElements(elements, 'x')
                    await parseElements(elements)
                } else if (el.type === 'diagram') {
                    const elements = el.elements.map(_el => ({
                        ..._el,
                        left: _el.left + originLeft,
                        top: _el.top + originTop,
                    }))
                    await parseElements(elements)
                }
            }
        }
        await parseElements([...item.elements, ...item.layoutElements])
        pptInfo.slides.push(slide)
    }
    if (browserHandler) {
        await browserHandler.clean()
    }
    return pptInfo
}

/**
 * @description 获取pptx信息
 * @param fileUrl
 * @returns {Promise<{fileName: string, buffer: ArrayBuffer}>}
 */
export async function getRemotePptx(fileUrl) {
    if (!fileUrl) {
        throw new Error('文件地址错误')
    }
    let res = await fetch(getDocHttpUrl(fileUrl))
    let buffer = await res.arrayBuffer()
    let fileName = decodeURIComponent(res.headers.get('content-disposition')?.split(';')[1]?.split('=')[1]).replace(/^"/ig, '').replace(/.pptx"$/ig, '')
    return {buffer, fileName}
}

/**
 * @description 导入pptx
 * @param {String} url pptx下载链接
 * @param {Object} userInfo 用户信息
 * @returns {Promise<{slides: *[], viewportSize: number, slideIndex: number, theme: {themeColors: *}, title}>}
 */
export async function importRemote(url, userInfo) {
    let {buffer, fileName} = await getRemotePptx(url)
    let json = await pptxtojson.parse(buffer)
    //console.log('has table', json?.slides?.some(_s => _s?.elements?.some(_e => _e?.type === 'table')));
    //console.log(JSON.stringify(json));
    return convertPptxJsonToPptInfo(json, fileName, userInfo)
}