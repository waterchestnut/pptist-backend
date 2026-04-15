/**
 * @fileOverview 导入PPT模版
 * @author xianyang
 * @module
 */

import '../init.js'
import pptInfoDac from '../daos/core/dac/pptInfoDac.js'
import fs from 'fs'

const tools = pptonline.tools
const baseDir = pptonline.baseDir

let userInfo = {
    userCode: 'micro',
    realName: '超级管理员',
}

async function importTmpl() {
    let data = await fs.promises.readFile(`${baseDir}init-data/cache/tmpl.json`, 'utf-8')
    let tmplList = JSON.parse(data)
    tmplList.forEach(tmpl => {
        tmpl.operator = userInfo
    })
    await pptInfoDac.bulkUpdate(tmplList)
    console.log(`总模版数: ${tmplList.length}`)
}

await importTmpl()

console.log('done')