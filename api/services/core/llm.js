/**
 * @fileOverview 大模型相关的服务
 * @author xianyang 2025/7/1
 * @module
 */

import {OpenAI} from 'openai'
import {ragSearch} from '../../grpc/clients/ragSearch.js'
import {addAgentTask} from '../../grpc/clients/agentController.js'
import {getFileText} from './fileInfo.js'
import pptInfoDac from '../../daos/core/dac/pptInfoDac.js'
import {extractorTmplPrompts, getCurAllTmpls, getMostSuitableTmpl} from './tmpl.js'

const config = pptonline.config
const pptGenLLMConfig = config.pptGenLLMConfig
const llmApiConfig = config.llmApiConfig
const tools = pptonline.tools

const syllabusSysPrompt = `
    ## 定位
    - 角色：PPT制作专家
    - 任务：根据输入的主题和信息，按照指定的语言，生成结构化的PPT大纲数据
    
    ## 输出要求
    - PPT的内容分为5~8个章节
    - 每个章节由1~6个部分组成
    - 每个部分都有1~10项具体的内容
    - 输出的内容只包括该主题正式内容，不包含封面、目录、致谢等内容
    - 参考输出样例返回markdown格式的数据：
      - 输出markdown必须是4级结构（主标题、章标题、节标题、内容）
      - 样例中的“第x章”、“第x节”、“内容x”、“更多章节”，应该替换为实际的内容，切记返回内容中不要包含“第x章”、“第x节”、“内容x”、“更多章节”字样
    `
const syllabusExamplePrompt = `
    输出样例：
    # 主标题
    ## 第1章
    ### 第1节
    - 内容1
    - 内容2
    - 内容3
    - 内容4
    ### 第2节
    - 内容1
    - 内容2
    - 内容3
    
    ## 第2章
    ### 第1节
    - 内容1
    - 内容2
    - 内容3
    ### 第2节
    - 内容1
    - 内容2
    - 内容3
    ### 第3节
    - 内容1
    - 内容2
    - 内容3
    
    ## 第3章
    ### 第1节
    - 内容1
    - 内容2
    ### 第2节
    - 内容1
    - 内容2
    
    ## 第4章
    ### 第1节
    - 内容1
    - 内容2
    - 内容3
    - 内容4
    ### 第2节
    - 内容1
    - 内容2
    - 内容3
    - 内容4
    
    <!-- 更多章节 -->
    `

const pptStylePrompt = `
    ## 风格分类：根据选择的风格，要求输出内容的语气/表达风格参考以下定义
    #### 学术风
    - 核心：客观、严谨、专业、数据驱动
    - 典型句式：“实验结果表明…”
    #### 职场风
    - 核心：简洁、决策导向、高效传递信息
    - 典型句式：“建议采取以下三项措施…”
    #### 教育风
    - 核心：易懂、互动、分层、引导
    - 典型句式：“第一步：观察现象…”
    #### 营销风
    - 核心：夸张、吸引、情感化、行动号召
    - 典型句式：“立即抢购，立省1000元！”
    #### 通用
    - 核心：中性、普适、清晰
`

const pptSysPrompt = `
    ## 定位
    - 角色：PPT制作专家
    - 任务：根据输入的PPT大纲，按照给定的风格和语言，进一步扩展和充实内容，生成结构化的PPT数据；如果用户提供了详细材料，扩展和充实内容时优先使用用户提供的详细材料
    
    ## 输出要求
    - PPT中包含以下类型的页面：
      - 封面页（cover），该类型页面包括以下元素：
        - 封面页标题，15字以内
        - 封面页正文，60字以内
      - 目录页（contents），该类型页面包括4~10个目录，每个目录标题字数在12字以内
      - 过渡页（transition），该类型页面包括以下元素：
        - 过渡页标题，15字以内
        - 过渡页正文，50字以内
      - 内容页（content），该类型页面包括以下元素：
        - 内容标题，15字以内
        - 1~10个内容项，每项内容由1个标题（10字以内）和1段正文（50~100字）组成
      - 结束页（end）
    - 一份完整的PPT数据应该包括1个封面页、1个目录页、多个过渡页、多个内容页、1个致谢页，总页数在20~30页区间
    - 请严格遵守上述文本字数要求
    
    ${pptStylePrompt}
    `
const pptExamplePromptStream = `
        参考以下输出样例，严格返回JSONL（JSON Lines）格式的数据，每个对象单独成行，无需额外解释：
        { "type": "cover", "data": { "title": "封面页标题", "text": "封面页正文", } }
        { "type": "contents", "data": { "items": [ "目录标题1", "目录标题2", "目录标题3", "目录标题4" ] } }
        { "type": "transition", "data": { "title": "过渡页标题", "text": "过渡页正文" } }
        { "type": "content", "data": { "title": "内容标题", "items": [ { "title": "内容项标题1", "text": "内容项文本1" }, { "title": "内容项标题2", "text": "内容项文本2" } ] } }
        { "type": "end" }
        `
const pptExamplePromptJson = `
        ## 输出样例（参考输出样例返回JSON格式的数据，无需额外解释）：
        [
            {
              "type": "cover",
              "data": {
                "title": "封面标题",
                "text": "封面正文",
              },
            },
            {
              "type": "contents",
              "data": {
                "items": [
                  "目录标题1",
                  "目录标题2",
                  "目录标题3",
                  "目录标题4",
                ],
              },
            },
            {
              "type": "transition",
              "data": {
                "title": "过渡标题",
                "text": "过渡正文",
              },
            },
            {
              "type": "content",
              "data": {
                "title": "内容标题",
                "items": [
                  {
                    "title": "内容项标题1",
                    "text": "内容项文本1",
                  },
                  {
                    "title": "内容项标题2",
                    "text": "内容项文本2",
                  },
                ],
              },
            },
            {
              "type": "end",
            },
        ]
        `

const writingSysPrompt = `
## 定位
- 角色：编辑、文字工作从业者，具备专业知识储备、语言文字能力，擅长行文措辞
- 任务：根据给定的操作指令，对输入的文本进行相应处理，处理方式包括美化改写、扩写丰富、精简提炼

## 指令
不同操作指令的具体要求如下：
- 美化改写：保留原文核心意思，运用更优美、流畅的词汇和表达方式，优化句子结构，提升整体文采
- 扩写丰富：在不改变原文核心意思的基础上，添加细节、例子、解释等内容，使文本更加丰富、生动，扩写后的字数应大于原文本，但不得超过原文本字数的2倍
- 精简提炼：去除原文中的冗余信息，保留关键内容，使文本更加简洁明了，精简后的字数应小于原文本

## 输出要求
- 只输出处理后的文本，不进行任何其它解释说明，不要用引号括住回复
- 处理后的文本应该与原本的文本内容是相同的语言，如：原本的文本内容是中文，处理后也为中文；原本的文本内容是英文，处理后也为英文，以此类推
`

export async function getPPTPrompts(tmplCode, stream = true) {
    if (!tmplCode) {
        return {
            sys: pptSysPrompt,
            example: stream ? pptExamplePromptStream : pptExamplePromptJson
        }
    }
    let tmplInfo = await pptInfoDac.getByCode(tmplCode)
    if (tmplInfo?.aiIndividual) {
        let example = await extractorTmplPrompts(tmplCode, tmplInfo)
        return {
            sys: `
    ## 定位
    - 角色：PPT制作专家
    - 任务：根据输入的PPT大纲，按照给定的风格和语言，进一步扩展和充实内容，生成结构化的PPT数据；如果用户提供了详细材料，扩展和充实内容时优先使用用户提供的详细材料
    
    ## 输出要求
    - PPT中包含以下类型的页面：
      - 封面页（cover），选择样例中类型为cover的页面，套用格式和要求生成内容
      - 目录页（contents），选择样例中类型为contents的页面，套用格式和要求生成内容
      - 过渡页（transition），选择样例中类型为transition的页面，套用格式和要求生成内容
      - 内容页（content），选择样例中类型为content的页面，套用格式和要求生成内容
      - 结束页（end），选择样例中类型为end的页面，套用格式和要求生成内容
    - 页面中的页面插图（pageFigure）和背景图（background），根据本页的PPT内容推荐pexels网站的英文检索词
    - 页面中的项目插图（itemFigure），根据本组列表项目和列表项目标题推荐推荐pexels网站的英文检索词
    - 为保证PPT展示效果，生成的items数组的大小请严格保持和使用样例模版的items数组的大小一致
    - id、groupId保持选择的样例中该字段的值不变
    - 请注意，样例中的字段名是大小写敏感的，输出时保持大小写敏感
    - 一份完整的PPT数据应该包括1个封面页、1个目录页、多个过渡页、多个内容页、1个结束页，总页数在10~30页区间
    - 请严格遵守上述文本字数要求
    
    ${pptStylePrompt}
`,
            example: stream ?
                `
        参考以下输出样例，严格返回JSONL（JSON Lines）格式的数据，每个对象单独成行，无需\`\`\`json等额外解释：
        ${example.map(_ => JSON.stringify(_)).join('\n')}
`
                :
                `
## 输出样例（参考输出样例直接返回JSON格式的数据，无需\`\`\`json等额外解释）：
${JSON.stringify(example, null, 2)}
`
        }
    }
    return {
        sys: pptSysPrompt,
        example: stream ? pptExamplePromptStream : pptExamplePromptJson
    }
}

/**
 * @description 生成PPT大纲
 * @author xianyang
 * @param {String} subject PPT主题
 * @param {Object} [options] 处理选项
 * @returns {Promise<String>} Markdown格式的PPT大纲文本
 */
export async function genPPTSyllabus(subject, options = {}) {
    const openai = new OpenAI({
        apiKey: pptGenLLMConfig.apiKey,
        baseURL: pptGenLLMConfig.baseURL,
    })

    let fileText = ''
    if (options?.fileInfo?.fileCode) {
        fileText = await getFileText(options.fileInfo)
        fileText = fileText.substring(0, 20000)
    }

    const userPrompt = `
    ## 指定语言：${options.language || '中文'} \n
    ## 主题和信息： \n
    ${fileText || subject}
    `
    let ret = await openai.chat.completions.create(
        {
            model: pptGenLLMConfig.model,
            messages: [
                {
                    'role': 'system',
                    'content': syllabusSysPrompt
                },
                {
                    'role': 'user',
                    'content': syllabusExamplePrompt,
                },
                {
                    'role': 'user',
                    'content': userPrompt,
                }
            ],
            max_tokens: pptGenLLMConfig.maxTokens || 8192,
            temperature: pptGenLLMConfig.temperature || 0.7,
            stream: options.stream
        }
    )

    if (options.stream) {
        for await (const chunk of ret) {
            const content = chunk.choices[0]?.delta?.content || ''
            options.streamCallback(content)
        }
        return 'done'
    } else {
        if (!ret?.choices?.length) {
            return ''
        }
        return ret.choices[0].message.content
    }
}

/**
 * @description 根据PPT大纲生成PPT
 * @author xianyang
 * @param {String} syllabus PPT大纲
 * @param {Object} [options] 处理选项
 * @returns {Promise<String|Object>} JSON格式的PPT
 */
export async function genPPT(syllabus, options = {}) {
    const openai = new OpenAI({
        apiKey: pptGenLLMConfig.apiKey,
        baseURL: pptGenLLMConfig.baseURL,
    })

    let fileText = ''
    if (options?.fileInfo?.fileCode) {
        fileText = await getFileText(options.fileInfo)
        fileText = fileText.substring(0, 20000)
    }

    let prompts = await getPPTPrompts(options.tmplCode, options.stream)
    const userPrompt = `
    ## 指定语言：${options.language || '中文'} \n
    ## 风格选择：${options.style || '通用'} \n
    ## 输入PPT大纲： \n
    ${syllabus} \n
    ${fileText ? '## 详细材料： \n' + fileText : ''}
    `
    let ret = await openai.chat.completions.create(
        {
            model: pptGenLLMConfig.model,
            messages: [
                {
                    'role': 'system',
                    'content': options.pptSysPrompt || prompts.sys
                },
                {
                    'role': 'user',
                    'content': options.examplePrompt || prompts.example,
                },
                {
                    'role': 'user',
                    'content': userPrompt,
                }
            ],
            max_tokens: pptGenLLMConfig.maxTokens || 8192,
            temperature: pptGenLLMConfig.temperature || 0.7,
            stream: options.stream,
            response_format: options.stream ? undefined : {
                type: 'json_object',
            },
        }
    )

    if (options.stream) {
        let buffer = ''

        for await (const chunk of ret) {
            const content = chunk.choices[0]?.delta?.content || ''
            buffer += content

            let newlineIndex
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim()
                buffer = buffer.slice(newlineIndex + 1)

                if (line) options.streamCallback(`${line}\n\n`)
            }
        }

        if (buffer.trim()) {
            options.streamCallback(`${buffer.trim()}\n\n`)
        }
        return 'done'
    } else {
        if (!ret?.choices?.length) {
            return []
        }
        return ret.choices[0].message.content
    }
}

/**
 * @description 模型文本优化创作
 * @author xianyang
 * @param {String} command 指令
 * @param {String} content 原文字
 * @param {Object} [options] 处理选项
 * @returns {Promise<String>} 大模型优化后的文本
 */
export async function aiWriting(command, content, options) {
    const openai = new OpenAI({
        apiKey: pptGenLLMConfig.apiKey,
        baseURL: pptGenLLMConfig.baseURL,
    })

    const userPrompt = `
    ## 指令：${command} \n
    ## 文字内容： \n
    ${content}
    `
    let ret = await openai.chat.completions.create(
        {
            model: pptGenLLMConfig.model,
            messages: [
                {
                    'role': 'system',
                    'content': writingSysPrompt
                },
                {
                    'role': 'user',
                    'content': userPrompt,
                }
            ],
            max_tokens: pptGenLLMConfig.maxTokens || 8192,
            temperature: pptGenLLMConfig.temperature || 0.7,
            stream: options.stream
        }
    )

    if (options.stream) {
        for await (const chunk of ret) {
            const content = chunk.choices[0]?.delta?.content || ''
            options.streamCallback(content)
        }
        return 'done'
    } else {
        if (!ret?.choices?.length) {
            return ''
        }
        return ret.choices[0].message.content
    }
}

/**
 * @description 获取课程思政的文摘
 * @author xianyang
 * @param {String} subject PPT主题
 * @param {Object} [options] 处理选项
 * @returns {Promise<Array>} 课程思政的文摘内容
 */
export async function getIdeologyContent(subject, options = {}) {
    const openai = new OpenAI({
        apiKey: pptGenLLMConfig.apiKey,
        baseURL: pptGenLLMConfig.baseURL,
    })
    let segInfoList = await ragSearch(subject, {ragCode: 'xuexi-cn-journal', maxLength: 6})
    if (!segInfoList?.length) {
        return []
    }
    /*console.log(segInfoList.length)*/
    let userContent = ['**原文材料：**']
    segInfoList.forEach(item => {
        userContent.push(`材料标识：${item.ragSegmentCode}，材料原文：${item.content}`)
    })
    userContent.push(`主题：${subject}`)
    let ret = await openai.chat.completions.create(
        {
            model: pptGenLLMConfig.model,
            messages: [
                {
                    'role': 'system',
                    'content': '你是一个课程思政语录摘取助手，根据用户的主题从用户提供的材料中摘取3段文本，每段文本总字数不超过500个字符，返回格式：[{"ragSegmentCode":"<材料标识>","text":"<本段文本内容>"}]，只能从用户给定的材料中摘取原文，不能随意发挥，如果没有合适的原文摘取，请回答：未找到。请以 JSON 格式输出结果。'
                },
                {
                    'role': 'user',
                    'content': userContent.join('\n'),
                }
            ],
            max_tokens: pptGenLLMConfig.maxTokens || 8192,
            temperature: pptGenLLMConfig.temperature || 0.7,
            response_format: {type: 'json_object'}
        }
    )
    /*console.log(JSON.stringify(ret))*/
    if (!ret?.choices?.length || ret.choices[0].message.content.startsWith('未找到')) {
        return []
    }
    /*console.log(ret.choices[0].message.content)*/
    let items = JSON.parse(ret.choices[0].message.content)
    if (!tools.isArray(items)) {
        return []
    }
    return items.map(item => {
        let segInfo = segInfoList.find(_ => _.ragSegmentCode === item.ragSegmentCode)
        item.title = segInfo?.resTitle
        item.url = segInfo?.resOriginalUrl
        return item
    })
}

/*获取生成PPT的任务*/
export async function getAgentTaskForPPT(subject, options = {}) {
    let fileText = ''
    if (options?.fileInfo?.fileCode) {
        fileText = await getFileText(options.fileInfo)
        fileText = fileText.substring(0, 20000)
    }

    let syllabusAgentTaskInfo = {
        title: '生成课件大纲',
        agentType: 'llm',
        handler: 'llmChat',
        params: {
            llmModel: llmApiConfig.aiPPTModel,
            llmMessages: [
                {
                    'role': 'system',
                    'content': syllabusSysPrompt
                },
                {
                    'role': 'user',
                    'content': syllabusExamplePrompt,
                },
                {
                    'role': 'user',
                    'content': `
    ## 指定语言：${options.language || '中文'} \n
    ## 主题和信息： \n
    ${fileText || subject}
    `,
                }
            ],
            llmOriginalParams: {}
        },
        handleMode: options.handleMode || 'manual',
        toParentOutputKey: 'syllabus'
    }

    let tmplInfo = await getMostSuitableTmpl(fileText ? fileText.substring(0, 300) : subject, options.operator)
    let tmplCode = tmplInfo?.pptCode
    let prompts = await getPPTPrompts(tmplCode, false)

    let contentAgentTaskInfo = {
        title: '生成课件内容',
        agentType: 'llm',
        handler: 'llmChat',
        params: {
            llmModel: llmApiConfig.aiPPTModel,
            llmMessages: [
                {
                    'role': 'system',
                    'content': prompts.sys
                },
                {
                    'role': 'user',
                    'content': prompts.example,
                },
                {
                    'role': 'user',
                    'content': `
    ## 指定语言：${options.language || '中文'} \n
    ## 风格选择：${options.style || '通用'} \n
    ## 输入PPT大纲： \n
    {{parentRet.syllabus}} \n
    ${fileText ? '## 详细材料： \n' + fileText : ''}
    `,
                }
            ],
            llmOriginalParams: {
                stream: false,
                response_format: {
                    type: 'json_object',
                },
            },
            tmplCode
        },
        handleMode: options.handleMode || 'manual',
        toParentOutputKey: 'pptContent'
    }
    let composeAgentTaskInfo = {
        title: '合成课件对象',
        agentType: 'grpc',
        handler: 'grpcCall',
        params: {
            grpcHost: config.grpcHost,
            grpcHandler: 'pptCompose',
            pptCode: options.pptCode || tools.getUUID(),
            pptTitle: options.pptTitle,
            operator: options.operator,
            tmplCode
        },
        handleMode: options.handleMode || 'manual',
        toParentOutputKey: 'pptMeta'
    }

    return {
        agentCode: tools.getUUID(),
        title: '生成课件大纲-ppt内容',
        agentType: 'sequential',
        handler: 'sequentialDispatch',
        handleMode: options.handleMode || 'manual',
        subAgents: [syllabusAgentTaskInfo, contentAgentTaskInfo, composeAgentTaskInfo]
    }
}

/*获取生成PPT的任务并添加到任务序列*/
export async function genAgentTaskForPPT(subject, options = {}) {
    let agentTaskInfo = await getAgentTaskForPPT(subject, options)
    let ret = await addAgentTask(agentTaskInfo)
    return ret
}