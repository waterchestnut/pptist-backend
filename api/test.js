/**
 * @fileOverview 临时验证功能
 * @author xianyang 2025/2/8
 * @module
 */

import './init.js'
import {ragSearch} from './grpc/clients/ragSearch.js'
import {getUserDetail} from './grpc/clients/userInfo.js'
import {genPPTSyllabus, getIdeologyContent} from './services/core/llm.js'
import {copyPpt, saveMyPpt} from "./services/core/pptInfo.js";
import {importRemote} from './services/core/importPptx.js'
import {getMostSuitableTmpl} from './services/core/tmpl.js'

(async () => {
    // 表格：82cd994087e811f0a0c79d9aca0eb52c
    // 公式：50a5c2a088a411f0ae5b05f3be3bb219, ok
    // 全：2213d5008a0511f0a0c79d9aca0eb52c
    // 基础文字：3204fa308a2711f0ae5b05f3be3bb219
    /*let filePath = 'https://apisix.local/doc/file/download/?fileCode=3204fa308a2711f0ae5b05f3be3bb219';
    let pptInfo = await importRemote(filePath);
    console.log(pptInfo);*/
    let data = await getMostSuitableTmpl('大学生职业生涯规划',{
        userCode: 'teacher01',
        realName: '教师01'
    });
    console.log(data);
    console.log('done');
})();