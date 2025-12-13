/**
 * @fileOverview 大模型生成PPT的操作
 * @author xianyang 2025/9/2
 * @module
 */

import {chromium} from 'playwright'

const config = pptonline.config

/*根据主题词生成PPT*/
export async function genOnePPT(subject, pptCode) {
    /*启动浏览器*/
    /*headless: false 表示显示浏览器界面*/
    const browser = await chromium.launch({headless: true})
    /*创建新页面*/
    const page = await browser.newPage()
    /*访问网页*/
    await page.goto('https://localhost:15173/?accessToken=teacher01%3A9f129a4087cc11f0834fb11433a55a3c')
    //await page.waitForSelector('.add-slide', {state: 'visible', timeout: 60000})
    await page.click('.menu-item .ai.text')
    //await page.waitForSelector('.aippt-dialog .submit', {state: 'visible', timeout: 60000})
    await page.click('.aippt-dialog .popover.select-wrap')
    /*截屏*/
    await page.screenshot({path: 'index.png'})
    /*关闭浏览器*/
    await browser.close()
}

/*模拟浏览器脚本执行*/
export async function execConsoleFun() {
    const browser = await chromium.launch({headless: true})
    const page = await browser.newPage()
    const cellData = {
        'text': '<p style="text-align: center;"><span style="font-size: 18pt;font-family: DengXian;">&nbsp;</span></p>',
        'fontBold': true,
        'fontColor': '#FFFFFF',
        'fillColor': '#4472C4',
        'borders': {
            'bottom': {
                'borderColor': '#FFFFFF',
                'borderWidth': 1,
                'borderType': 'solid',
                'strokeDasharray': '0'
            },
            'top': {'borderColor': '#FFFFFF', 'borderWidth': 1, 'borderType': 'solid', 'strokeDasharray': '0'},
            'left': {'borderColor': '#FFFFFF', 'borderWidth': 1, 'borderType': 'solid', 'strokeDasharray': '0'},
            'right': {'borderColor': '#FFFFFF', 'borderWidth': 1, 'borderType': 'solid', 'strokeDasharray': '0'}
        }
    }
    const result = await page.evaluate((cellData) => {
        const ratio = 4 / 3
        const theme = {
            themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
            fontColor: '#333',
            fontName: '',
        }
        const style = {
            fontname: theme.fontName,
            color: theme.fontColor,
        }

        let textDiv = document.createElement('div')
        textDiv.innerHTML = cellData.text
        const p = textDiv.querySelector('p')
        const align = p?.style.textAlign || 'left'

        const span = textDiv.querySelector('span')
        const fontsize = span?.style.fontSize ? (parseInt(span?.style.fontSize) * ratio).toFixed(1) + 'px' : ''
        const fontname = span?.style.fontFamily || ''
        const color = span?.style.color || cellData.fontColor

        return {
            id: 123,
            colspan: cellData.colSpan || 1,
            rowspan: cellData.rowSpan || 1,
            text: textDiv.innerText,
            style: {
                ...style,
                align: ['left', 'right', 'center'].includes(align) ? align : 'left',
                fontsize,
                fontname,
                color,
                bold: cellData.fontBold,
                backcolor: cellData.fillColor,
            },
        }
    }, cellData)
    console.log(result)
}

/*调用前端生成PPT结构的数据*/
export async function packagePPT(contentObj, tmplCode) {
    const browser = await chromium.launch({headless: true})
    const page = await browser.newPage()
    await page.goto(`${config.frontendBaseUrl}?isMock=1`)
    await page.waitForSelector('.element-content', {state: 'visible', timeout: 60000})
    const result = await page.evaluate(async (contentObj) => {
        return genPPTContent(contentObj, tmplCode)
    }, contentObj)
    console.log(result)
    return result
}