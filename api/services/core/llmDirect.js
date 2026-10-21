/**
 * @fileOverview AI直出模式：不经模板，由大模型直接生成符合pptist规范的最终slides JSON数据
 * 两阶段管线：1)全局设计规划（标题/学科类型/主题配色/逐页版式编排） 2)按页或按章生成最终Slide JSON（公式矢量渲染、搜图、校验、排版体检、入场动画注入）
 * @author xianyang 2026-10-14
 * @module
 */

import fs from 'fs'
import {OpenAI} from 'openai'
import {jsonrepair} from 'jsonrepair'
import {hfmath, CONFIG as hfmathConfig} from 'hfmath'
import {getFileText} from './fileInfo.js'
import {proxyImgSearch} from './pexels.js'
import {renderDemo} from '../../grpc/clients/renderer.js'
import {saveFile} from '../../grpc/clients/fileManage.js'
import {sha1} from '../../tools/security.js'
import {buildDemoFallbackElements} from './demoFallback.js'

const config = pptonline.config
const pptGenLLMConfig = config.pptGenLLMConfig
const tools = pptonline.tools
const logger = pptonline.logger
const baseDir = pptonline.baseDir

hfmathConfig.SUB_SUP_SCALE = 0.5

const CANVAS_WIDTH = 1000
const CANVAS_HEIGHT = 562.5
const VIEWPORT_RATIO = 0.5625
const ALLOWED_ELEMENT_TYPES = ['text', 'image', 'shape', 'line', 'table', 'chart', 'latex', 'video']
const CHART_TYPES = ['bar', 'column', 'line', 'pie', 'ring', 'area', 'radar', 'scatter']
const PAGE_TYPES = ['cover', 'contents', 'transition', 'content', 'end']
const DEMO_KINDS = ['projectile', 'force_analysis', 'lever', 'derivation', 'limit', 'wave', 'transform', 'reaction', 'custom']
/*入场动画效果家族：按页确定性选一个家族，家族内方向轮换——多样且风格统一*/
const EFFECT_FAMILIES = [
    ['fadeIn', 'fadeInUp', 'fadeInDown', 'fadeInLeft', 'fadeInRight'],
    ['slideInUp', 'slideInLeft', 'slideInRight', 'slideInDown'],
    ['zoomIn', 'zoomInUp', 'zoomInLeft', 'zoomInRight', 'zoomInDown'],
    ['bounceInUp', 'bounceInLeft', 'bounceInRight', 'bounceInDown', 'bounceIn'],
    ['rotateIn', 'rotateInUpLeft', 'rotateInUpRight', 'rotateInDownLeft', 'rotateInDownRight'],
    ['backInUp', 'backInLeft', 'backInRight', 'backInDown'],
]

function pickEffectFamily(slide) {
    const key = String(slide.id || '')
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return EFFECT_FAMILIES[h % EFFECT_FAMILIES.length]
}
/*LLM调用计数（统计用）*/
let _llmCalls = 0

/*---------------- 设计知识（运行时从磁盘加载并缓存） ----------------*/

let _schemaDoc = null
let _knowledge = null

function getSchemaDoc() {
    if (!_schemaDoc) {
        _schemaDoc = fs.readFileSync(`${baseDir}services/core/prompts/AI_PPT_SCHEMA.md`, 'utf-8')
    }
    return _schemaDoc
}

/*绘制类版式（统计库中没有，专供原理示意/公式推导）*/
const SYNTHETIC_LAYOUTS = [
    {
        key: 'formula-derivation', name: '公式推导页',
        description: '标题下1~4行latex公式自上而下排布，每行公式左侧配编号芯片（小圆角矩形shape+序号文本）或结论文本，公式间用细分割线分隔，重点公式底部衬浅色色块强调',
        synthetic: true, pageTypes: {content: 1}, frequency: 0, avgElementCount: 8,
    },
    {
        key: 'flow-diagram', name: '流程图示页',
        description: '3~6个圆角矩形/胶囊节点（shape+内部或下方标签文本）按横向或纵向排布，节点间用带箭头端点的line连接，可用编号芯片标注步骤序，适合讲流程/机制/步骤',
        synthetic: true, pageTypes: {content: 1}, frequency: 0, avgElementCount: 12,
    },
    {
        key: 'principle-diagram', name: '原理示意图页',
        description: '中央大形状（圆/矩形容器）表达研究对象，周围引线（line+arrow）连接标签文本与小形状说明部件/构成，一侧配1~2个关键公式latex，适合讲结构/原理/守恒',
        synthetic: true, pageTypes: {content: 1}, frequency: 0, avgElementCount: 10,
    },
    {
        key: 'coordinate-curve', name: '坐标曲线页',
        description: '用两条line画坐标轴，配合chart元素或若干数据点形状+标注文本表达函数关系/变化趋势，旁边配结论框（色块+文本）',
        synthetic: true, pageTypes: {content: 1}, frequency: 0, avgElementCount: 9,
    },
]

export function getDesignKnowledge() {
    if (!_knowledge) {
        _knowledge = JSON.parse(fs.readFileSync(`${baseDir}services/core/prompts/design-knowledge.json`, 'utf-8'))
        _knowledge.layouts = [..._knowledge.layouts, ...SYNTHETIC_LAYOUTS]
        for (const l of SYNTHETIC_LAYOUTS) _knowledge.goldenSlides.push({layoutKey: l.key, slide: null})
    }
    return _knowledge
}

/*版式菜单文本（注入提示词）*/
function buildLayoutMenu() {
    const knowledge = getDesignKnowledge()
    return knowledge.layouts.map(l => {
        const pageTypes = Object.keys(l.pageTypes).join('/')
        const freq = l.synthetic ? '绘制类' : `真实出现${l.frequency}次`
        return `- ${l.key}【${l.name}】(适用页型:${pageTypes}; ${freq}; 平均元素数:${l.avgElementCount})：${l.description}`
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

function buildPlanPrompt(options = {}) {
    const maxPages = options.maxPages && options.maxPages >= 6 && options.maxPages <= 20 ? `不超过${options.maxPages}页` : '8~13页'
    return `
## 角色
你是一位资深课件视觉设计师与内容策划专家。你不依赖任何模板，直接为整套课件做全局设计规划：决定标题、学科类型、配色主题（设计DNA）、以及每一页的页面类型与版式。

## 任务
根据用户提供的主题和材料，输出一份JSON格式的全局设计规划。

## 页面结构规则（宁少勿多，信息密度宁高勿碎）
- 总页数${maxPages}，按信息量取下限优先；主题简单时6~8页也完全可以
- 章节3~5个，每章1~2个content页
- 必须包含：1个cover（封面）、1个contents（目录）、每个章节开头1个transition（过渡页）、若干content（内容页）、1个end（结束页）
- contents目录页的条目与transition章节一一对应

## 版式编排规则（防单调，必须严格遵守）
- 相邻的两个content页不得使用相同layout
- 全稿content页至少使用5种不同的layout
- 每页的视觉锚点一律优先用"绘制"实现：shape图形/流程图/示意图、chart图表、table、latex公式、大数字；**照片类image全稿最多1页**，仅当确需真实场景照片时在该页规划imageQueries，否则content页不要规划imageQueries
- 至少1个data-chart或data-table数据页；强烈建议包含：1个big-number大数字页、1个flow-diagram流程图页或principle-diagram原理图页
- 若主题属于STEM/工程/医学类：至少3个content页使用formula-derivation版式或在layout描述性标注formulas字段给出该页关键公式（KaTeX子集语法）
- 只允许从下方"可用版式菜单"中选择layout

## 原理演示动画规则（让课件"会动"）
- 当某页讲解运动过程/受力变化/公式推导/几何变换/极限逼近/波动/杠杆平衡/化学平衡移动等"原理"时，可为该页附加demo字段，由渲染服务生成演示动画视频并自动嵌入该页（你只需给出演示意图，不要生成视频本身）
- 全稿最多2页使用demo；demo页的points不超过2项，动画画面负责演示过程；视频最终会占用约半页或整页净空区，该区域内不得再安排任何文字/图形
- demo.kind 只允许：projectile(抛体运动,可带v0/angleDeg)、force_analysis(受力分析逐力出现)、lever(杠杆平衡)、derivation(公式分步推导,steps为公式字符串数组，与页面latex公式同一套KaTeX子集语法、无需$包裹、不得含中文，每步一条，系统自动转换渲染)、limit(极限逼近)、wave(行波,可带wavelength/speed)、transform(几何变换,mode为rotate/reflect/translate)、reaction(化学平衡移动)、custom(通用帧序列原理演示，见下)
- **custom 通用帧序列**（不属于上述8类原理时用custom，如单摆、光路、电路、滴定、细胞分裂、机械结构等任意过程演示）：params={"title":"演示标题","frames":[{"caption":"该帧说明(≤12字)","static":true/缺省,"elements":[图元...]}]}；2~6帧，每帧1~14个图元；图元坐标一律用**0~100归一化画布**（y向下）；图元类型：{"type":"line","from":[x,y],"to":[x,y],"arrow":true,"style":"dashed","color":"#hex"}、{"type":"rect","x":,"y":,"w":,"h":,"rx":,"fill":"#hex","color":"#hex"}、{"type":"circle","cx":,"cy":,"r":,"fill":,"color":}、{"type":"arc","cx":,"cy":,"r":,"a1":度,"a2":度,"color":}、{"type":"path","d":"M x y L x y Q cx cy x y C ... Z(仅大写绝对坐标)","fill":,"color":}、{"type":"poly","points":[[x,y],...],"fill":,"color":}、{"type":"text","x":,"y":,"s":"mathtext如v_{max}(不含中文)","size":1~10,"color":}；**第一帧建议 static:true 放支架/坐标系等全程不变的底图**，其后每帧描述一个状态（位置/箭头/数值随帧变化），caption写阶段说明
- demo页layout要与视频画面配合：derivation→formula-derivation；projectile/wave/limit/transform/force_analysis/lever→split-image-right或split-image-left（一侧留给视频画面）

## 可用版式菜单
${buildLayoutMenu()}

## 学科类型与配色（色彩要丰富，先判断genre再定palette）
- genre可选值：STEM（数学/物理/化学/生物）/ 工程与技术 / 商业与管理 / 人文社科 / 艺术文学 / 儿童青少年教育 / 医学健康 / 法律政务
- 配色指引：STEM→深蓝/靛紫+青+琥珀撞色；工程→钢蓝+橙；商业→藏蓝+金/灰蓝渐变；人文→米棕/赭红/墨绿；艺术→高饱和撞色（品红/紫/青）；儿童→糖果色（亮黄/珊瑚/天蓝/草绿）；医学→青绿+天蓝；法律政务→庄重红+金
- palette给出5~6个HEX：主色、2~3个辅色、1个强调色、1个中性浅色；避免全稿只用一个色系两个色
- 背景基调backgroundColor不要求纯白：封面/过渡页规划渐变或深色底，内容页用浅色底或微渐变

## 设计DNA要求
- visualDirection：一句话描述整体视觉方向（如"靛蓝理科风·公式驱动·流程示意"）
- fontName：从数据规范的可用字体列表中选择

## 排版基准
${buildDesignStats()}

## 输出格式（严格JSON，不要任何额外解释）
{
  "title": "课件主标题（15字以内）",
  "design": {
    "genre": "学科类型",
    "visualDirection": "整体视觉方向",
    "palette": ["#主色", "#辅色1", "#辅色2", "#强调色", "#中性浅色"],
    "backgroundColor": "#内容页背景色",
    "fontColor": "#正文默认色",
    "fontName": "字体key"
  },
  "pages": [
    {"type": "cover", "layout": "cover-center", "title": "封面标题", "subtitle": "副标题（20字以内）", "gradient": "渐变两端色"},
    {"type": "contents", "layout": "contents-list", "items": ["章节标题1", "章节标题2"]},
    {"type": "transition", "layout": "transition-number", "number": "01", "title": "章节标题", "text": "章节导语（40字以内）"},
    {"type": "content", "layout": "cards-3", "title": "页标题", "points": [{"title": "要点标题（10字内）", "text": "要点正文（40~70字）"}]},
    {"type": "content", "layout": "formula-derivation", "title": "页标题", "formulas": ["E = mc^2", "\\\\frac{a}{b}"], "points": [{"text": "公式含义说明（40字内）"}]},
    {"type": "content", "layout": "split-image-right", "title": "页标题", "points": [{"title": "结论", "text": "结论说明（40字内）"}], "demo": {"kind": "projectile", "params": {"v0": 18, "angleDeg": 40}}},
    {"type": "content", "layout": "data-chart", "title": "页标题", "points": [{"text": "数据结论（40字内）"}], "chart": {"chartType": "column", "labels": ["Q1", "Q2"], "legends": ["营收"], "series": [[100, 130]]}},
    {"type": "end", "layout": "cover-center", "title": "谢谢聆听", "text": "结束语"}
  ]
}
注：content页points为1~4项；formulas仅公式类版式给出；imageQueries几乎不用（全稿≤1页）；样例中的省略号位置都应替换为实际内容。
`
}

/*单页生成系统提示词*/
function buildSlideSysPrompt(design, pageSpec) {
    const layoutMeta = getDesignKnowledge().layouts.find(l => l.key === pageSpec.layout)
    return `
## 角色
你是pptist课件渲染引擎的版式设计模块。根据给定的页面规划，输出一页完整的、符合下述数据规范的Slide JSON。你的输出将被直接渲染，没有任何后处理。

## 数据规范（唯一事实来源，严格遵守）
${getSchemaDoc()}

## 全局设计DNA（所有页共用，必须保持一致）
- 学科类型：${design.genre || '通用'}；视觉方向：${design.visualDirection}
- 主题色板：${design.palette.join(', ')}（第1个为主色；强调色用在编号、关键数字、局部底衬）
- 内容页背景：${design.backgroundColor}；正文默认色：${design.fontColor}；默认字体：${design.fontName}
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

## 视觉表达规则（多用绘制，少用照片）
- 视觉锚点优先用 shape（卡片/色带/容器/编号芯片）、line（分割线/流程箭头/坐标轴）、chart、table、latex 绘制实现
- 只有本页规划明确给出imageQueries时才输出image元素（src填""，加query字段），否则一个image都不要
- 每页至少使用色板中3种颜色：标题主色/深色、卡片或底衬浅色、编号装饰强调色
- 装饰最低要求：cover必须有渐变或大色块背景、标题不小于40px；contents条目配编号装饰；transition有超大节编号（60px以上）；end有装饰色块或渐变

## 公式规则（理科类页面必须遵守）
- 公式一律使用type:"latex"元素，给出 {"type":"latex","id":"el_xx","left":..,"top":..,"width":..,"height":..,"color":"..","latex":"KaTeX子集语法"}；path/尺寸由系统渲染生成，不要输出path和viewBox
- 支持：\\frac \\sqrt x^2 a_{ij} \\sum \\int \\lim \\infty \\to 希腊字母 \\times \\cdot \\pm \\div \\approx \\neq \\leq \\geq \\left( \\right) \\vec \\mathrm
- **latex字段内严禁出现中文**（渲染器不支持，中文会丢失）：变量含义、单位说明等中文一律写在旁边的text元素里
- 严禁把公式塞进text元素用unicode拼凑；规划formulas中的公式必须原样以latex元素呈现（可按版面微调间距）
- **公式必须独占一行**：latex矩形上下各留至少20px净空，任何文本/图片/形状不得与其重叠；系统按字形自然尺寸渲染（实际宽度可能比你给的大），长公式务必拆成多个latex元素逐行排布，行距≥16px
- 公式颜色必须与所在背景明显对比：深色背景（深色页、深色底衬形状）上的公式显式给浅色color（如"#FFFFFF"），浅色背景给深色；系统会按对比度自动兜底修正，但请优先自行配对

## 图片占位协议
- image元素src一律填空字符串""，加"query"字段填英文Pexels检索词；系统会替换真实图片，切勿编造URL

## 演示视频协议（仅当本页规划含demo字段时）
- 输出视频占位元素：{"type":"video","id":"el_demo_01","left":..,"top":..,"width":..,"height":..,"rotate":0,"src":"","render":{"kind":"<demo.kind原样复制>","params":{...demo.params原样复制}}}；src保持空字符串，系统渲染真实视频并回填，不要编造URL
- **视频尺寸三选一（系统会强制归一到以下档位，请按档位边界排版）**：
  1. 左右半页档（16:9类）：约470x265，完整落在页面左半区（left≈45）或右半区（left≈485），垂直居中；标题正文放另一半页
  2. 上下半页档（超宽横幅类，宽高比>2）：约640x245或900x245，水平居中，落在上半部（top≈55）或下半部（top≈262）；其余内容放另一横半页
  3. 全页档（宽高比≈16:9且面积>半页）：约950x535居中，本页只保留一行短标题，正文移到其他页
- 任何元素不得与视频矩形重叠（含文字、形状、线条）；demo页最多2个视觉区块（视频+标题/要点）

## 演讲备注（必须输出）
- Slide 必须包含 remark 字段：30~80字**纯文本**口语化讲解词（不要HTML标签、不要引号包裹整个字段值以外的内容）
- 内容是这个页面"讲给学员听的串词"：按页面视觉顺序组织讲述（先看什么后看什么）、公式按符号含义念出来、图表先结论后数据；理科解释推导思路，商业给决策导向，教育给互动提问
- 不得复读页面文字原文，禁止"本页介绍了……""接下来我们看……"式空话套话

## 其他
- 元素id以el_前缀且页内唯一；富文本HTML只允许数据规范白名单内的标签与样式
- 动画由系统统一注入，不要输出animations字段；若本页有希望**按顺序强调展示**的核心元素（结论、公式、图表、主卡片等），给这些元素加 "emphasis":N（N从1开始，1最先出场；**每页最多标注4个**，只标核心，标题/装饰/正文不要标）；不标注则系统自动挑选核心元素或不加动画
- 文本内容使用规划中的文案，可按排版需要微调标点，不得大幅改写
- 只输出一个Slide JSON对象，不要markdown围栏、不要任何解释
`
}

/*按章生成系统提示词*/
function buildChapterSysPrompt(design) {
    return `
## 角色
你是pptist课件渲染引擎的版式设计模块。根据给定的章节规划，一次性输出该章节的连续多页（1个过渡页+若干内容页）完整Slide JSON数组。输出将被直接渲染，没有任何后处理。

## 数据规范（唯一事实来源，严格遵守）
${getSchemaDoc()}

## 全局设计DNA（所有页共用，必须保持一致）
- 学科类型：${design.genre || '通用'}；视觉方向：${design.visualDirection}
- 主题色板：${design.palette.join(', ')}；内容页背景：${design.backgroundColor}；正文默认色：${design.fontColor}；默认字体：${design.fontName}

## 跨页设计要求（按章生成的核心优势，必须利用）
- 章节内各content页版式互不相同，并与前一章的版式错开
- 过渡页与内容页构成"引入→展开→收束"节奏；同一概念在章内不同页保持视觉语言一致（相同色块/编号芯片样式）
- 公式、示意图、图表按需要在页间衔接：例如推导页在过渡页预告结论，随后页面展开步骤

## 版式与视觉规则
- 视觉锚点优先用 shape/line/chart/table/latex 绘制；image仅当该页规划给出imageQueries时输出（src为""+query），否则不要输出image
- 某页规划含demo时：输出视频占位元素（src为""，render原样复制kind/params），尺寸必须按档位：左右半页约470x265（贴左left≈45或贴右left≈485，垂直居中）/ 上下横幅约640~900x245（水平居中，top≈55或≈262）/ 全页约950x535居中（本页仅留一行短标题）；系统会强制归一档，任何元素不得与视频矩形重叠
- 每页至少使用色板中3种颜色；单页元素3~14个
- 画布${CANVAS_WIDTH} x ${CANVAS_HEIGHT}，左右安全边距≥40；文本防溢出：所需高度≈行数x字号x行高+8，必须≤元素高度
- 公式一律用type:"latex"元素（给latex/left/top/width/height/color，不要path/viewBox，尺寸由系统渲染时计算）；latex字段内严禁中文（中文说明写进text元素）；禁止在text元素里用unicode拼公式；**公式独占一行、上下留≥20px净空、不得被任何后绘制元素压盖，长公式拆分为多个latex元素逐行排布；深色背景上的公式color必须用浅色（如#FFFFFF），系统按对比度兜底**
${buildDesignStats()}

## 输出格式
只输出一个JSON对象（不要markdown围栏、不要解释）：
{"slides": [ {Slide页1}, {Slide页2}, ... ]}
slides数组的长度、顺序必须与章节规划的页数一致，每个元素都是完整的Slide对象。
每个Slide都必须包含 remark 字段：30~80字纯文本口语化讲解词（不要HTML），是该页"讲给学员听的串词"——按页面视觉顺序组织讲述、公式念出符号含义、图表先结论后数据；不得复读页面文字原文，禁止空话套话。
动画由系统统一注入（不要输出animations字段）；需要按顺序强调的核心元素可加 "emphasis":N（1最先，每页最多4个，只标核心元素）。
`
}

function buildSlideUserPrompt(plan, pageIndex, fileText, extraFeedback) {
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
${fileText ? `\n## 参考材料（内容优先取材于此）\n${fileText.substring(0, 4000)}\n` : ''}${goldenBlock}${extraFeedback ? `\n## 上一版存在以下问题，本次必须修复\n${extraFeedback}` : ''}`
}

function buildChapterUserPrompt(plan, unit, fileText, extraFeedback) {
    const outline = plan.pages.map((p, i) => {
        const inUnit = i >= unit.start && i < unit.start + unit.pageSpecs.length
        return `${inUnit ? '>>' : '  '} ${i + 1}.[${p.type}/${p.layout}] ${p.title || ''}`
    }).join('\n')
    return `## 课件标题
${plan.title}

## 全稿大纲（>>为当前要生成的章节，共${unit.pageSpecs.length}页）
${outline}

## 当前章节规划（按顺序逐页生成，输出slides数组长度=${unit.pageSpecs.length}）
${JSON.stringify(unit.pageSpecs, null, 1)}
${fileText ? `\n## 参考材料（内容优先取材于此）\n${fileText.substring(0, 4000)}\n` : ''}${extraFeedback ? `\n## 上一版存在以下问题，本次必须修复\n${extraFeedback}` : ''}`
}

/*---------------- LLM调用 ----------------*/

/*给可能永久悬挂的外部等待加超时护栏*/
function withTimeout(promise, ms, label) {
    let timer
    return Promise.race([
        Promise.resolve(promise).then((v) => {
            clearTimeout(timer)
            return v
        }, (e) => {
            clearTimeout(timer)
            throw e
        }),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
        }),
    ])
}

async function callLLM(messages, options = {}) {
    _llmCalls++
    const trace = typeof options.trace === 'function' ? options.trace : null
    const t0 = Date.now()
    const promptChars = messages.reduce((a, m) => a + String(m.content || '').length, 0)
    const emitCall = (ok, completionChars, error) => {
        if (!trace) return
        try {
            trace({
                event: 'llm_call',
                role: options.role || '-',
                model: options.model || pptGenLLMConfig.model,
                promptChars,
                completionChars,
                ms: Date.now() - t0,
                ok,
                error: error ? String(error).substring(0, 200) : undefined,
            })
        } catch (e) { /* 记录失败不影响生成 */
        }
    }
    const openai = new OpenAI({
        apiKey: pptGenLLMConfig.apiKey,
        baseURL: pptGenLLMConfig.baseURL,
    })
    let ret
    try {
        ret = await openai.chat.completions.create({
            model: options.model || pptGenLLMConfig.model,
            messages,
            max_tokens: Math.min(pptGenLLMConfig.maxTokens || 8192, 16384),
            temperature: options.temperature !== undefined ? options.temperature : pptGenLLMConfig.temperature || 0.7,
            stream: false,
            response_format: {type: 'json_object'},
        })
    } catch (e) {
        emitCall(false, 0, e.message || e)
        throw e
    }
    if (!ret?.choices?.length) {
        emitCall(false, 0, '空响应')
        return null
    }
    const content = ret.choices[0].message.content
    emitCall(true, String(content || '').length)
    return content
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
                {role: 'system', content: buildPlanPrompt(options)},
                {role: 'user', content: userPrompt},
            ], {temperature: 0.6, model: options.model, trace: options.onTrace, role: 'plan'})
            let plan = parseJSONText(content)
            plan = normalizePlan(plan, options)
            if (plan) return {plan, fileText}
            lastErr = new Error('设计规划JSON解析失败')
        } catch (e) {
            lastErr = e
            logger.warn('genPPTDirectPlan 第%s次尝试失败: %s', attempt + 1, e.message || e)
        }
    }
    throw lastErr || new Error('设计规划生成失败')
}

const ALLOWED_FONTS = ['SourceHanSans', 'SourceHanSerif', 'WenDingPLKaiTi', 'WenDingPLSongTi', 'ZhuqueFangSong', 'LXGWWenKai', 'AlibabaPuHuiTi', 'MiSans', 'DeYiHei', 'CangerXiaowanzi', 'YousheTitleBlack', 'FengguangMingrui', 'ShetuModernSquare', 'ZcoolHappy', 'ZizhiQuXiMai', 'SucaiJishiKangkang', 'SucaiJishiCoolSquare', 'TuniuRounded', 'RuiziZhenyan', 'SourceSerif4', 'JetBrainsMono', 'Literata', 'Inter', 'Roboto', 'OpenSans', 'Montserrat', 'SourceSansPro', 'Merriweather']

/*规划兜底修正*/
function normalizePlan(plan, options = {}) {
    if (!plan || !Array.isArray(plan.pages) || plan.pages.length < 5) return null
    const maxPages = options.maxPages && options.maxPages >= 6 ? Math.min(options.maxPages, 20) : 14
    plan.pages = plan.pages.filter(p => p && PAGE_TYPES.includes(p.type))
    if (!plan.pages.find(p => p.type === 'cover')) plan.pages.unshift({type: 'cover', layout: 'cover-center'})
    if (!plan.pages.find(p => p.type === 'end')) plan.pages.push({type: 'end', layout: 'cover-center'})
    if (plan.pages.length > maxPages) {
        /*优先裁剪中间的content页保结构*/
        let guard = 0
        while (plan.pages.length > maxPages && guard++ < 40) {
            const idx = plan.pages.map((p, i) => [p, i]).filter(([p]) => p.type === 'content').map(([, i]) => i)
            if (!idx.length) break
            plan.pages.splice(idx[Math.floor(idx.length / 2)], 1)
        }
    }
    let validLayouts = new Set(getDesignKnowledge().layouts.map(l => l.key))
    let lastContentLayout = null
    for (const p of plan.pages) {
        if (p.type === 'content' && (!validLayouts.has(p.layout) || p.layout === lastContentLayout)) {
            const menu = ['cards-3', 'flow-diagram', 'formula-derivation', 'list-rows', 'split-image-right', 'cards-4', 'big-number', 'data-chart', 'principle-diagram', 'timeline', 'image-top', 'title-bullets']
            p.layout = menu.find(k => validLayouts.has(k) && k !== lastContentLayout) || 'cards-3'
        }
        if (p.type === 'content') lastContentLayout = p.layout
        if (p.type !== 'content' && !p.layout) p.layout = p.type === 'contents' ? 'contents-list' : (p.type === 'transition' ? 'transition-number' : 'cover-center')
    }
    if (!plan.title) plan.title = '未命名课件'
    const d = plan.design = plan.design || {}
    if (!Array.isArray(d.palette) || !d.palette.length) d.palette = ['#1D4ED8', '#0EA5E9', '#F59E0B', '#A5F3FC', '#F8FAFC']
    d.palette = d.palette.filter(c => typeof c === 'string').slice(0, 6)
    if (!d.palette.length) d.palette = ['#1D4ED8', '#0EA5E9', '#F59E0B', '#A5F3FC', '#F8FAFC']
    d.backgroundColor = d.backgroundColor || '#FFFFFF'
    d.fontColor = d.fontColor || '#333333'
    d.fontName = ALLOWED_FONTS.includes(d.fontName) ? d.fontName : 'SourceHanSans'
    d.visualDirection = d.visualDirection || '简约商务·卡片化'
    d.genre = d.genre || '通用'
    return plan
}

/*---------------- 公式渲染（hfmath → 矢量path） ----------------*/

/*剔除latex中的中文（渲染器不支持），如剔完失去意义则判为无效*/
function stripCJKFromLatex(latex) {
    if (!/[\u4e00-\u9fff]/.test(latex)) return latex
    let out = latex
        .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{[^{}]*[\u4e00-\u9fff][^{}]*\}/g, '')
        .replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '')
        .replace(/\{\s*\}/g, '')
    if (out.replace(/[^a-zA-Z0-9]/g, '').length < 2) return null
    return out.trim()
}

function renderLatex(el) {
    const cleaned = stripCJKFromLatex(el.latex)
    if (!cleaned) return null
    el.latex = cleaned
    try {
        const eq = new hfmath(el.latex)
        const path = eq.pathd({})
        const box = eq.box({})
        if (!path || !box || !box.w) return null
        const naturalW = box.w + 32
        const naturalH = box.h + 32
        /*同时适配模型给出的宽高：取宽/高缩放比的较小者，避免公式按自然尺寸放大后撑破卡片/画布*/
        const wantW = typeof el.width === 'number' && el.width > 40 ? el.width : naturalW
        const wantH = typeof el.height === 'number' && el.height > 24 ? el.height : naturalH
        let scale = Math.min(wantW / naturalW, wantH / naturalH)
        scale = Math.min(Math.max(scale, 0.4), 1.6)
        let fw = round2(naturalW * scale)
        let fh = round2(naturalH * scale)
        if (fw > CANVAS_WIDTH - 80) {
            const k = (CANVAS_WIDTH - 80) / fw
            fw = round2(fw * k)
            fh = round2(fh * k)
        }
        if (fh > CANVAS_HEIGHT - 80) {
            const k = (CANVAS_HEIGHT - 80) / fh
            fw = round2(fw * k)
            fh = round2(fh * k)
        }
        /*越界回收：把公式整体移回画布安全区*/
        let left = el.left
        let top = el.top
        if (left + fw > CANVAS_WIDTH - 20) left = round2(CANVAS_WIDTH - 20 - fw)
        if (left < 20) left = 20
        if (top + fh > CANVAS_HEIGHT - 16) top = round2(CANVAS_HEIGHT - 16 - fh)
        if (top < 16) top = 16
        return {
            type: 'latex',
            id: el.id,
            left: round2(left),
            top: round2(top),
            width: fw,
            height: fh,
            rotate: 0,
            latex: el.latex,
            path,
            color: isColor(el.color) ? el.color : '#333333',
            strokeWidth: 2,
            viewBox: [naturalW, naturalH],
            fixedRatio: true,
        }
    } catch (e) {
        logger.warn('latex渲染失败: %s => %s', el.latex, e.message || e)
        return null
    }
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

/*视频布局档位归一化：强制半页（左右半页/上下半页横幅）或全页，防止占位视频与元素互相压盖*/
export function normalizeVideoBox(el) {
    const canvasArea = CANVAS_WIDTH * CANVAS_HEIGHT
    let w = num(el.width, 460)
    let h = num(el.height, round2(w * 9 / 16))
    if (w <= 0 || h <= 0) { w = 460; h = 259 }
    let aspect = w / h
    aspect = Math.min(2.6, Math.max(1.15, aspect))
    const side = el.left + w / 2 <= CANVAS_WIDTH / 2 ? 'L' : 'R'
    const band = el.top + h / 2 <= CANVAS_HEIGHT / 2 ? 'T' : 'B'
    if (w * h >= canvasArea * 0.5) {
        /*全页档：按比例占满页面*/
        let fw = Math.min(960, round2(535 * aspect))
        let fh = round2(fw / aspect)
        if (fh > 535) {
            fh = 535
            fw = round2(fh * aspect)
        }
        el.width = fw
        el.height = fh
        el.left = round2((CANVAS_WIDTH - fw) / 2)
        el.top = round2((CANVAS_HEIGHT - fh) / 2)
    } else if (aspect <= 2.05) {
        /*左右半页：宽约半页，垂直居中（覆盖4:3~16:9等常规比例）*/
        const hw = 470
        const hh = Math.min(500, Math.max(200, round2(hw / aspect)))
        el.width = hw
        el.height = hh
        el.left = side === 'L' ? 45 : round2(CANVAS_WIDTH - 45 - hw)
        el.top = round2((CANVAS_HEIGHT - hh) / 2)
    } else {
        /*上下半页：横幅比例，高约半页的四成半，水平居中*/
        const hh = 245
        const hw = Math.min(900, Math.max(440, round2(hh * aspect)))
        el.width = hw
        el.height = hh
        el.left = round2((CANVAS_WIDTH - hw) / 2)
        el.top = band === 'T' ? 55 : round2(CANVAS_HEIGHT - hh - 55)
    }
    return el
}

/*公式避让修复：latex按自然字形放大后可能被后绘制元素遮挡，先垂直挪移、再整体缩小*/
export function fixLatexClearance(slide) {
    for (let i = 0; i < slide.elements.length; i++) {
        const el = slide.elements[i]
        if (el.type !== 'latex') continue
        const isBlocked = () => {
            for (let j = i + 1; j < slide.elements.length; j++) {
                const o = slide.elements[j]
                if (o.type === 'line') continue
                const inter = rectOverlap({x: el.left, y: el.top, w: el.width, h: el.height}, {x: o.left, y: o.top, w: o.width || 0, h: o.height || 0})
                if (inter / Math.max(1, el.width * el.height) > 0.45) return true
            }
            return false
        }
        if (!isBlocked()) continue
        const originTop = el.top
        const tried = [24, -24, 48, -48, 72, -72, 96, -96]
        for (const dy of tried) {
            el.top = round2(Math.min(CANVAS_HEIGHT - el.height - 8, Math.max(8, originTop + dy)))
            if (!isBlocked()) break
        }
        if (isBlocked()) {
            /*挪移无效：整体缩小（viewBox不变，渲染自动缩放）*/
            el.top = originTop
            const origW = el.width
            const origH = el.height
            for (const s of [0.8, 0.65, 0.55]) {
                el.width = round2(origW * s)
                el.height = round2(origH * s)
                if (el.left + el.width > CANVAS_WIDTH - 20) el.left = round2(CANVAS_WIDTH - 20 - el.width)
                if (el.top + el.height > CANVAS_HEIGHT - 8) el.top = round2(CANVAS_HEIGHT - 8 - el.height)
                if (!isBlocked()) break
            }
        }
    }
    return slide
}

/*custom帧序列参数校验（与python渲染器契约一致，双侧防御）*/
const CUSTOM_TYPE_WHITELIST = ['line', 'rect', 'circle', 'arc', 'path', 'poly', 'text']
const CUSTOM_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s]+\))$/

function _cnum(v, lo = 0, hi = 100) {
    return typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null
}

function _cleanCustomElement(e) {
    if (!e || typeof e !== 'object' || !CUSTOM_TYPE_WHITELIST.includes(e.type)) return null
    const out = {type: e.type}
    const color = typeof e.color === 'string' && CUSTOM_COLOR_RE.test(e.color) ? e.color : undefined
    const fill = typeof e.fill === 'string' && e.fill !== 'none' && CUSTOM_COLOR_RE.test(e.fill) ? e.fill : undefined
    if (color) out.color = color
    if (fill) out.fill = fill
    switch (e.type) {
        case 'line': {
            if (!Array.isArray(e.from) || !Array.isArray(e.to) || e.from.length !== 2 || e.to.length !== 2) return null
            const [x1, y1, x2, y2] = [_cnum(e.from[0]), _cnum(e.from[1]), _cnum(e.to[0]), _cnum(e.to[1])]
            if ([x1, y1, x2, y2].some(v => v === null)) return null
            out.from = [x1, y1]
            out.to = [x2, y2]
            if (e.arrow) out.arrow = true
            if (e.style === 'dashed') out.style = 'dashed'
            return out
        }
        case 'rect': {
            const x = _cnum(e.x), y = _cnum(e.y), w = _cnum(e.w), h = _cnum(e.h)
            if ([x, y, w, h].some(v => v === null) || Math.min(w, 100 - x) < 1 || Math.min(h, 100 - y) < 1) return null
            Object.assign(out, {x, y, w: Math.min(w, 100 - x), h: Math.min(h, 100 - y)})
            const rx = _cnum(e.rx, 0, 10)
            if (rx) out.rx = rx
            return out
        }
        case 'circle': {
            const cx = _cnum(e.cx), cy = _cnum(e.cy), r = _cnum(e.r, 0.5, 50)
            if ([cx, cy, r].some(v => v === null)) return null
            return Object.assign(out, {cx, cy, r})
        }
        case 'arc': {
            const cx = _cnum(e.cx), cy = _cnum(e.cy), r = _cnum(e.r, 0.5, 50)
            const a1 = _cnum(e.a1, -360, 360), a2 = _cnum(e.a2, -360, 360)
            if ([cx, cy, r, a1, a2].some(v => v === null)) return null
            return Object.assign(out, {cx, cy, r, a1, a2})
        }
        case 'text': {
            if (typeof e.s !== 'string' || !e.s.trim() || e.s.length > 48) return null
            const x = _cnum(e.x), y = _cnum(e.y)
            if (x === null || y === null) return null
            out.x = x
            out.y = y
            out.s = e.s.replace(/[\u4e00-\u9fff]/g, '')
            if (!out.s.trim()) return null
            const size = _cnum(e.size, 1, 10)
            if (size) out.size = size
            return out
        }
        case 'path': {
            const d = typeof e.d === 'string' ? e.d.trim() : ''
            if (!d || d.length > 400 || !/^[MLQCZmlqcz\s\d.\-,]+$/.test(d)) return null
            out.d = d
            return out
        }
        case 'poly': {
            if (!Array.isArray(e.points) || e.points.length < 3 || e.points.length > 20) return null
            const pts = []
            for (const pt of e.points) {
                if (!Array.isArray(pt) || pt.length !== 2) return null
                const x = _cnum(pt[0]), y = _cnum(pt[1])
                if (x === null || y === null) return null
                pts.push([x, y])
            }
            out.points = pts
            return out
        }
    }
    return null
}

export function validateCustomDemoParams(params) {
    const raw = params && Array.isArray(params.frames) ? params.frames : null
    if (!raw || raw.length < 2 || raw.length > 6) return null
    const frames = []
    for (const f of raw.slice(0, 6)) {
        if (!f || typeof f !== 'object' || !Array.isArray(f.elements) || !f.elements.length) return null
        const els = []
        for (const e of f.elements.slice(0, 14)) {
            const c = _cleanCustomElement(e)
            if (c) els.push(c)
        }
        if (!els.length) return null
        frames.push({
            caption: typeof f.caption === 'string' ? f.caption.substring(0, 24) : '',
            static: !!f.static,
            elements: els,
        })
    }
    if (frames.length < 2) return null
    return {frames, title: typeof params.title === 'string' ? params.title.substring(0, 20) : '', ...(params.seconds ? {seconds: _cnum(params.seconds, 3, 12)} : {})}
}

/*视频占位元素渲染时长：custom按帧数扩展*/
function demoSeconds(spec) {
    if (spec.params && typeof spec.params.seconds === 'number') {
        return Math.min(12, Math.max(3, spec.params.seconds))
    }
    if (spec.kind === 'custom' && Array.isArray(spec.params?.frames)) {
        return Math.min(12, Math.max(4, Math.round(2 + spec.params.frames.length * 1.6)))
    }
    return 6
}

function sanitizeElement(el) {
    if (!el || typeof el !== 'object' || !ALLOWED_ELEMENT_TYPES.includes(el.type)) return null
    const base = {type: el.type, id: typeof el.id === 'string' && el.id ? el.id : `el_${tools.getUUID().substring(0, 8)}`, rotate: num(el.rotate, 0)}
    base.left = num(el.left, 0)
    base.top = num(el.top, 0)
    if (base.left < -80 || base.top < -80 || base.left > CANVAS_WIDTH + 80 || base.top > CANVAS_HEIGHT + 80) return null
    /*动画强调标注：模型输出 emphasis:1~8（二次清洗从 _em 继承），由 attachAnimations 消费后移除*/
    const em = typeof el.emphasis === 'number' ? el.emphasis : (typeof el._em === 'number' ? el._em : null)
    if (em !== null && em >= 1 && em <= 8) base._em = Math.round(em)
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
        case 'video': {
            /*占位视频元素：src为空 + render:{kind,params} 由渲染服务回填*/
            if (typeof el.src === 'string' && el.src) {
                base.src = el.src
                base.ext = 'mp4'
            } else {
                const render = el.render
                if (!render || !DEMO_KINDS.includes(render.kind)) return null
                if (render.kind === 'custom') {
                    const valid = validateCustomDemoParams(render.params)
                    if (!valid) return null
                    base.src = ''
                    base.ext = 'mp4'
                    base.render = {kind: 'custom', params: valid}
                } else {
                    base.src = ''
                    base.ext = 'mp4'
                    base.render = {kind: render.kind, params: render.params && typeof render.params === 'object' ? render.params : {}}
                }
            }
            /*强制半页/全页档位，避免视频与其他元素互相压盖*/
            normalizeVideoBox(base)
            base.autoplay = false
            base.poster = typeof el.poster === 'string' ? el.poster : ''
            break
        }
        case 'latex': {
            if (typeof el.latex !== 'string' || !el.latex.trim()) return null
            const rendered = renderLatex({...base, latex: el.latex})
            if (!rendered) {
                /*渲染失败降级：用文本元素承载近似表达*/
                return {
                    type: 'text',
                    id: base.id,
                    left: base.left,
                    top: base.top,
                    width: Math.max(200, base.width),
                    height: Math.max(40, base.height),
                    rotate: 0,
                    content: `<p><span style="font-size:22px;">${escapeHTML(el.latex)}</span></p>`,
                    defaultFontName: 'JetBrainsMono',
                    defaultColor: isColor(el.color) ? el.color : '#333333',
                }
            }
            return rendered
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
            base.themeColors = Array.isArray(el.themeColors) && el.themeColors.filter(isColor).length ? el.themeColors.filter(isColor) : ['#1D4ED8', '#0EA5E9', '#F59E0B', '#A5F3FC']
            if (isColor(el.textColor)) base.textColor = el.textColor
            if (isColor(el.lineColor)) base.lineColor = el.lineColor
            if (isColor(el.fill)) base.fill = el.fill
            break
        }
    }
    return base
}

function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    const slide = {id, background: sanitizeBackground(raw.background), elements}
    if (raw.type && PAGE_TYPES.includes(raw.type)) slide.type = raw.type
    /*演讲者备注透传：剥掉模型可能夹带的HTML标签，限长防脏数据*/
    if (typeof raw.remark === 'string' && raw.remark.trim()) {
        slide.remark = raw.remark.replace(/<[^>]*>/g, '').trim().substring(0, 500)
    }
    return slide
}

/*---------------- 入场动画注入（确定性装饰，不经LLM） ----------------*/

function getElRect(el) {
    if (el.type === 'line') {
        return {x: el.left, y: el.top, w: Math.abs(el.end[0] - el.start[0]) || 2, h: Math.abs(el.end[1] - el.start[1]) || 2}
    }
    return {x: el.left, y: el.top, w: el.width || 0, h: el.height || 0}
}

function rectsNear(a, b, pad = 24) {
    const ax1 = a.x - pad, ay1 = a.y - pad, ax2 = a.x + a.w + pad, ay2 = a.y + a.h + pad
    return ax1 < b.x + b.w && ax2 > b.x && ay1 < b.y + b.h && ay2 > b.y
}

/*把元素聚成视觉块（标题块/卡片组/图文组），用于逐块出场*/
function clusterCandidates(candidates) {
    const clusters = []
    const used = new Set()
    for (const c of candidates) {
        if (used.has(c.el.id)) continue
        const group = [c]
        used.add(c.el.id)
        let grew = true
        while (grew) {
            grew = false
            for (const other of candidates) {
                if (used.has(other.el.id)) continue
                if (group.some(g => rectsNear(g.r, other.r))) {
                    group.push(other)
                    used.add(other.el.id)
                    grew = true
                }
            }
        }
        clusters.push(group)
    }
    return clusters
}

export function attachAnimations(slide, pageType) {
    try {
        attachAnimationsInner(slide, pageType)
    } finally {
        for (const el of slide.elements) delete el._em
    }
}

/*只为核心元素添加入场动画：模型emphasis标注优先 > 启发式挑选核心元素 > 无可强调内容则不加*/
function attachAnimationsInner(slide, pageType) {
    const elements = slide.elements
    /*分镜面板兜底（demo渲染失败产物）：保持逐帧点击*/
    if (elements.some(el => el.__frame !== undefined)) {
        attachFrameAnimations(slide)
        return
    }
    if (pageType !== 'content') return
    /*1) 模型显式标注的强调元素：按emphasis分组，数字小的先出场，最多4组*/
    const marked = elements.filter(el => typeof el._em === 'number')
    let groups = []
    if (marked.length) {
        const byEm = {}
        for (const el of marked) (byEm[el._em] = byEm[el._em] || []).push(el)
        groups = Object.keys(byEm).map(Number).sort((a, b) => a - b).slice(0, 4).map(k => byEm[k])
    } else {
        /*2) 启发式：只挑核心元素（条目文本/公式/图表/表格/视频/整幅配图），邻近归组，按文档顺序=内容顺序排列*/
        const core = []
        for (const el of elements) {
            if (['latex', 'chart', 'table', 'video'].includes(el.type)) core.push(el)
            else if (el.type === 'text' && ['item', 'itemTitle'].includes(el.textType)) core.push(el)
            else if (el.type === 'image' && el.imageType === 'pageFigure') core.push(el)
        }
        if (core.length) {
            const items = []
            for (const el of core) {
                const r = getElRect(el)
                if (r.w < 12 || r.h < 12) continue
                items.push({el, r})
            }
            const clustered = clusterCandidates(items)
            clustered.sort((a, b) => elements.indexOf(a[0].el) - elements.indexOf(b[0].el))
            groups = clustered.slice(0, 4).map(g => g.map(x => x.el))
        }
    }
    if (!groups.length) return
    const family = pickEffectFamily(slide)
    const animations = []
    groups.forEach((group, gi) => {
        group.forEach((el, ei) => {
            animations.push({
                id: `an_${tools.getUUID().substring(0, 10)}`,
                elId: el.id,
                effect: ei === 0 ? family[gi % family.length] : 'fadeIn',
                type: 'in',
                duration: 500 + (gi % 3) * 100,
                trigger: ei === 0 ? 'click' : 'measured',
            })
        })
    })
    if (animations.length) slide.animations = animations
}

/*分镜面板：底图与页面同现，其后每帧一次点击出场*/
function attachFrameAnimations(slide) {
    const elements = slide.elements
    const canvasArea = CANVAS_WIDTH * CANVAS_HEIGHT
    const candidates = []
    for (const el of elements) {
        if (el.type === 'line') continue
        const r = getElRect(el)
        if (el.type === 'shape' && r.w * r.h > canvasArea * 0.5) continue
        if (r.w < 12 || r.h < 12) continue
        candidates.push({el, r})
    }
    const byFrame = {}
    const normal = []
    for (const c of candidates) {
        if (c.el.__frame === undefined) normal.push(c)
        else (byFrame[c.el.__frame] = byFrame[c.el.__frame] || []).push(c)
    }
    const family = pickEffectFamily(slide)
    const animations = []
    const order = Object.keys(byFrame).sort((a, b) => {
        if (a === 'base') return -1
        if (b === 'base') return 1
        return Number(a) - Number(b)
    })
    let effectIdx = 0
    order.forEach((fk, gi) => {
        const group = byFrame[fk]
        group.forEach((c, ei) => {
            animations.push({
                id: `an_${tools.getUUID().substring(0, 10)}`,
                elId: c.el.id,
                effect: gi === 0 ? 'fadeIn' : (ei === 0 ? family[effectIdx++ % family.length] : 'fadeIn'),
                type: 'in',
                duration: 500,
                trigger: gi === 0 ? 'measured' : (ei === 0 ? 'click' : 'measured'),
            })
        })
    })
    /*非分镜元素（页面标题等）与页面同现*/
    for (const c of normal) {
        animations.unshift({id: `an_${tools.getUUID().substring(0, 10)}`, elId: c.el.id, effect: 'fadeIn', type: 'in', duration: 400, trigger: 'measured'})
    }
    for (const el of elements) delete el.__frame
    if (animations.length) slide.animations = animations
}

/*翻页动画：封面/结束页淡入，过渡页左右滑动*/
function attachTurningMode(slide, pageType) {
    if (pageType === 'cover' || pageType === 'end') slide.turningMode = 'fade'
    else if (pageType === 'transition') slide.turningMode = 'slideX'
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
            const ret = await withTimeout(proxyImgSearch({query, per_page: 5, page: 1}), 15000, 'pexels搜图')
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
    let hasPhoto = false
    for (const el of slide.elements) {
        if (el.type === 'image' && el.src) {
            hasVisual = true
            hasPhoto = true
        }
        if (['chart', 'table', 'latex'].includes(el.type)) hasVisual = true
        if (el.type === 'video') hasVisual = true
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
    /*公式/视频遮挡检测：数组序=层级序，后绘制元素压盖关键区域视为遮挡*/
    for (let i = 0; i < slide.elements.length; i++) {
        const e = slide.elements[i]
        if (!['latex', 'video'].includes(e.type)) continue
        const r = {x: e.left, y: e.top, w: e.width || 0, h: e.height || 0}
        for (let j = i + 1; j < slide.elements.length; j++) {
            const o = slide.elements[j]
            if (o.type === 'line') continue
            const ro = {x: o.left, y: o.top, w: o.width || 0, h: o.height || 0}
            const inter = rectOverlap(r, ro)
            const minArea = Math.min(r.w * r.h, ro.w * ro.h)
            if (e.type === 'video') {
                if (minArea > 0 && inter / minArea > 0.5) {
                    issues.push(`元素${o.id}与视频区${e.id}重叠：视频必须保持半页或全页净空，其他元素请移到页面另一半或视频上下方`)
                    break
                }
            } else if (inter / Math.max(1, r.w * r.h) > 0.5) {
                issues.push(`公式元素${e.id}被后绘制元素${o.id}遮挡：公式请独占一行并上下留至少20px净空，长公式拆分为多个latex元素分行排列`)
                break
            }
        }
    }
    if (pageType === 'content') {
        const totalText = texts.reduce((acc, el) => acc + (el.content || '').replace(/<[^>]+>/g, '').length, 0)
        if (!hasVisual || slide.elements.length < 3 || totalText > 420) issues.push('本页过于单调：请增加视觉锚点（绘制形状卡片组/流程图/图表/公式/大数字），并将正文精简为要点式短语')
    }
    return {ok: issues.length === 0, issues, hasPhoto}
}

/*上传二进制到文件服务，返回可访问URL*/
async function uploadBuffer(buffer, fileName, userInfo, folder = '') {
    let fileCode = sha1(buffer)
    await saveFile(userInfo, fileCode, {fileName}, {}, buffer, folder, 20000)
    return `${config.docConfig.baseUrl}/file/download/?fileCode=${fileCode}`
}

/*为演示视频占位元素调用渲染服务并回填src/poster；失败降级为三帧分镜面板*/
export async function resolveDemoVideos(slide, stats, options, palette = []) {
    const doTrace = typeof options.onTrace === 'function' ? options.onTrace : null
    const traceDemo = (ev) => {
        if (!doTrace) return
        try {
            const r = doTrace(ev)
            if (r && typeof r.catch === 'function') r.catch(() => {})
        } catch (e) { /* ignore */ }
    }
    const videos = slide.elements.filter(e => e.type === 'video' && !e.src && e.render)
    for (const el of videos) {
        const spec = el.render
        let ok = false
        const tRender = Date.now()
        try {
            const params = {...(spec.params || {})}
            /*按元素框2倍分辨率渲染（半页/全页档下保持清晰），不超过渲染服务1280x720像素上限*/
            let rw = Math.round(el.width) * 2
            let rh = Math.round(el.height) * 2
            const maxPx = 1280 * 720
            if (rw * rh > maxPx) {
                const s = Math.sqrt(maxPx / (rw * rh)) * 0.99
                rw = Math.round(rw * s)
                rh = Math.round(rh * s)
            }
            const ret = await withTimeout(renderDemo(spec.kind, params, {
                width: rw,
                height: rh,
                seconds: demoSeconds(spec),
                timeoutMs: 40000,
            }), 45000, '演示渲染')
            const userInfo = options.operator || {userCode: 'ai-direct', realName: 'AI直出'}
            el.src = await withTimeout(uploadBuffer(ret.video, `demo-${spec.kind}.mp4`, userInfo, 'ppt-demo'), 30000, '视频上传')
            if (ret.poster && ret.poster.length) {
                try {
                    el.poster = await withTimeout(uploadBuffer(ret.poster, `demo-${spec.kind}.png`, userInfo, 'ppt-demo'), 15000, '封面上传')
                } catch (e) { /* 封面失败不影响视频 */
                }
            }
            stats.renderOk++
            ok = true
            traceDemo({event: 'demo_render', kind: spec.kind, result: 'ok', ms: Date.now() - tRender})
        } catch (e) {
            stats.renderFailed++
            logger.warn('演示渲染失败(%s): %s', spec.kind, e.message || e)
        }
        if (!ok) {
            /*渲染不可用：在同净空区内生成三帧分镜面板兜底*/
            const idx = slide.elements.indexOf(el)
            slide.elements.splice(idx, 1)
            const fb = buildDemoFallbackElements(spec, {left: el.left, top: el.top, width: el.width, height: el.height}, palette.length ? palette : ['#2563EB'])
            const fallback = fb.elements || []
            for (let k = 0; k < fallback.length; k++) {
                /*分镜中的latex帧补走矢量渲染管线，失败则自动降级为文本*/
                if (fallback[k].type === 'latex') {
                    const rendered = sanitizeElement(fallback[k])
                    if (rendered) {
                        rendered.__frame = fallback[k].__frame
                        fallback[k] = rendered
                    }
                }
            }
            if (fallback.length) {
                slide.elements.splice(idx, 0, ...fallback)
                stats.renderFallbacked++
                traceDemo({event: 'demo_render', kind: spec.kind, result: 'fallback', ms: Date.now() - tRender})
            } else {
                traceDemo({event: 'demo_render', kind: spec.kind, result: 'failed', ms: Date.now() - tRender})
            }
        }
        delete el.render
    }
}

/*---------------- 公式色彩对比度自适应 ----------------*/

function parseColor(c) {
    if (typeof c !== 'string') return null
    let m = c.match(/^#([0-9a-fA-F]{3,8})$/)
    if (m) {
        let h = m[1]
        if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('')
        if (h.length === 6) h += 'ff'
        if (h.length !== 8) return null
        return {r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16), a: parseInt(h.substring(6, 8), 16) / 255}
    }
    m = c.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
        const p = m[1].split(/[,/\s]+/).filter(Boolean).map(parseFloat)
        if (p.length >= 3) return {r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3]}
    }
    return null
}

function luminanceOf(color) {
    if (!color) return null
    const f = v => {
        v = v / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(color.r) + 0.7152 * f(color.g) + 0.0722 * f(color.b)
}

/*公式的"有效背景"亮度：优先其下方(z序更早)覆盖它的不透明形状填充，其次页面背景；图片背景等无法判断返回 undefined*/
function effectiveBgLuminance(slide, elIdx, el) {
    for (let j = elIdx - 1; j >= 0; j--) {
        const o = slide.elements[j]
        if (o.type !== 'shape') continue
        const fc = parseColor(o.fill)
        if (!fc || fc.a * (typeof o.opacity === 'number' ? o.opacity : 1) < 0.85) continue
        if (o.left <= el.left + 2 && o.top <= el.top + 2
            && o.left + o.width >= el.left + el.width - 2 && o.top + o.height >= el.top + el.height - 2) {
            if (o.gradient && Array.isArray(o.gradient.colors) && o.gradient.colors.length) {
                const lum = o.gradient.colors.map(c => luminanceOf(parseColor(c.color))).filter(v => v !== null)
                if (lum.length) return lum.reduce((a, b) => a + b, 0) / lum.length
            }
            return luminanceOf(fc)
        }
    }
    const bg = slide.background
    if (bg && bg.type === 'solid') {
        const l = luminanceOf(parseColor(bg.color))
        return l === null ? undefined : l
    }
    if (bg && bg.type === 'gradient' && bg.gradient && Array.isArray(bg.gradient.colors) && bg.gradient.colors.length) {
        const lum = bg.gradient.colors.map(c => luminanceOf(parseColor(c.color))).filter(v => v !== null)
        return lum.length ? lum.reduce((a, b) => a + b, 0) / lum.length : undefined
    }
    return undefined
}

/*深色背景页上的公式（缺省深灰）按对比度自动换浅色，反之亦然；渲染层 svg stroke 取 element.color，改动即生效*/
export function fixLatexContrast(slide) {
    slide.elements.forEach((el, idx) => {
        if (el.type !== 'latex') return
        const bgL = effectiveBgLuminance(slide, idx, el)
        if (bgL === undefined) return
        const fc = parseColor(el.color)
        if (fc) {
            const fl = luminanceOf(fc)
            const contrast = (Math.max(fl, bgL) + 0.05) / (Math.min(fl, bgL) + 0.05)
            if (contrast >= 2.8) return
        }
        el.color = bgL < 0.35 ? '#FFFFFF' : '#1F2937'
    })
    return slide
}

/*---------------- 页级后处理 ----------------*/

async function postProcessSlide(slide, pageSpec, plan, stats, options = {}) {
    const lint = layoutLint(slide, pageSpec.type)
    if (lint.ok) stats.lintPass++
    else stats.lintWarn++
    await resolveSlideImages(slide, plan.design.palette)
    await resolveDemoVideos(slide, stats, options, plan.design.palette)
    fixLatexClearance(slide)
    fixLatexContrast(slide)
    attachAnimations(slide, pageSpec.type)
    for (const el of slide.elements) delete el.__frame
    attachTurningMode(slide, pageSpec.type)
    slide._lintIssues = lint.issues
    return slide
}

/*---------------- 单页生成 ----------------*/

async function genOneSlide(plan, pageIndex, fileText, options, stats, initialFeedback = '') {
    const pageSpec = plan.pages[pageIndex]
    const llmRole = 'page:' + (pageIndex + 1)
    let feedback = initialFeedback
    let lastSlide = null
    for (let attempt = 0; attempt < 2; attempt++) {
        let content
        try {
            content = await callLLM([
                {role: 'system', content: buildSlideSysPrompt(plan.design, pageSpec)},
                {role: 'user', content: buildSlideUserPrompt(plan, pageIndex, fileText, feedback)},
            ], {model: options.model, trace: options.onTrace, role: llmRole})
        } catch (e) {
            logger.warn('直出模式第%s页LLM调用失败: %s', pageIndex + 1, e.message || e)
            continue
        }
        const raw = parseJSONText(content)
        const slide = raw && sanitizeSlide(raw, new Set())
        if (!slide) {
            feedback = '上一版输出无法解析为合法的Slide JSON（必须包含elements数组）。请只输出一个JSON对象。'
            stats.retries++
            continue
        }
        lastSlide = slide
        const lint = layoutLint(slide, pageSpec.type)
        if (lint.ok || attempt === 1) return slide
        feedback = lint.issues.join('；')
        stats.retries++
    }
    return lastSlide
}

/*---------------- 按章生成 ----------------*/

/*把pages切分为生成单元：page粒度=每页一个；chapter粒度=过渡页+其内容页为一个，cover/contents/end独立*/
export function buildUnits(plan, granularity) {
    if (granularity !== 'chapter') {
        return plan.pages.map((p, i) => ({type: 'page', start: i, pageSpecs: [p]}))
    }
    const units = []
    let current = null
    plan.pages.forEach((p, i) => {
        if (p.type === 'content' && current && current.type === 'chapter') {
            current.pageSpecs.push(p)
        } else if (p.type === 'transition') {
            current = {type: 'chapter', start: i, pageSpecs: [p]}
            units.push(current)
        } else {
            current = null
            units.push({type: 'page', start: i, pageSpecs: [p]})
        }
    })
    return units
}

async function genOneUnit(plan, unit, fileText, options, stats, usedSlideIds) {
    if (unit.type === 'page') {
        const spec = unit.pageSpecs[0]
        const idx = unit.start
        let slide = await genOneSlide(plan, idx, fileText, options, stats)
        if (!slide) return []
        const dedup = sanitizeSlide(slide, usedSlideIds)
        if (!dedup) return []
        await postProcessSlide(dedup, spec, plan, stats, options)
        return [dedup]
    }

    /*chapter单元*/
    let feedback = ''
    let pageSlides = null
    for (let attempt = 0; attempt < 2; attempt++) {
        let content
        try {
            content = await callLLM([
                {role: 'system', content: buildChapterSysPrompt(plan.design)},
                {role: 'user', content: buildChapterUserPrompt(plan, unit, fileText, feedback)},
            ], {model: options.model, trace: options.onTrace, role: `chapter:${unit.start + 1}-${unit.start + unit.pageSpecs.length}`})
        } catch (e) {
            logger.warn('直出模式章节(起始页%s)LLM调用失败: %s', unit.start + 1, e.message || e)
            continue
        }
        const raw = parseJSONText(content)
        const arr = Array.isArray(raw?.slides) ? raw.slides : (Array.isArray(raw) ? raw : null)
        if (!arr || !arr.length) {
            feedback = '上一版输出无法解析为{"slides":[Slide,...]}结构。slides数组长度必须等于章节页数。'
            stats.retries++
            continue
        }
        /*按位置逐页清洗，保住页与规划的对应关系*/
        const got = unit.pageSpecs.map((_, pi) => pi < arr.length && arr[pi] ? sanitizeSlide(arr[pi], usedSlideIds) : null)
        const missing = got.filter(s => !s).length
        if (!missing) {
            pageSlides = got
            break
        }
        feedback = `有${missing}页缺失或不合法（每页必须是包含elements数组的完整Slide对象），请按规划重新输出全部${unit.pageSpecs.length}页。`
        stats.retries++
        if (attempt === 1) pageSlides = got /*重试后仍不全，接受部分结果，缺口页后面补*/
    }
    if (!pageSlides) {
        /*整章失败：逐页兜底*/
        stats.chapterFallbacks++
        const out = []
        for (let i = 0; i < unit.pageSpecs.length; i++) {
            const s = await genOneSlide(plan, unit.start + i, fileText, options, stats)
            const dedup = s && sanitizeSlide(s, usedSlideIds)
            if (dedup) {
                await postProcessSlide(dedup, unit.pageSpecs[i], plan, stats, options)
                out.push(dedup)
            }
        }
        return out
    }
    stats.chapterCalls++
    const out = []
    for (let i = 0; i < unit.pageSpecs.length; i++) {
        const spec = unit.pageSpecs[i]
        let slide = pageSlides[i]
        if (!slide) {
            /*章内缺页：单独补生成*/
            stats.pageRegens++
            const extra = await genOneSlide(plan, unit.start + i, fileText, options, stats)
            slide = extra && sanitizeSlide(extra, usedSlideIds)
            if (slide) await postProcessSlide(slide, spec, plan, stats, options)
            continue
        }
        const lint = layoutLint(slide, spec.type)
        if (!lint.ok && spec.type === 'content') {
            /*章内坏页带问题清单单独重生成一次（页级修补）*/
            stats.pageRegens++
            const fixed = await genOneSlide(plan, unit.start + i, fileText, options, {...stats, retries: 0}, lint.issues.join('；'))
            const fixedDedup = fixed && sanitizeSlide(fixed, usedSlideIds)
            if (fixedDedup) {
                await postProcessSlide(fixedDedup, spec, plan, stats, options)
                out.push(fixedDedup)
                continue
            }
        }
        await postProcessSlide(slide, spec, plan, stats, options)
        out.push(slide)
    }
    return out
}

/*---------------- 主流程 ----------------*/

/**
 * @description AI直出模式：根据主题/材料直接生成pptist最终课件数据
 * @param {String} subject PPT主题
 * @param {Object} [options] 处理选项 {language, fileInfo, model, stream, streamCallback, concurrency, granularity('page'|'chapter'), maxPages}
 * @returns {Promise<Object|String>} 非流式返回完整课件对象；流式返回'done'（数据经streamCallback按JSONL行推送）
 */
export async function genPPTDirect(subject, options = {}) {
    const emit = (obj) => {
        if (options.streamCallback) options.streamCallback(`${JSON.stringify(obj)}\n\n`)
    }
    const trace = typeof options.onTrace === 'function' ? options.onTrace : null
    const doTrace = (ev) => {
        if (!trace) return
        try {
            const r = trace(ev)
            if (r && typeof r.catch === 'function') r.catch(() => {})
        } catch (e) { /* 记录失败不影响生成 */
        }
    }
    const t0 = Date.now()
    const granularity = options.granularity || 'chapter'
    const callsBefore = _llmCalls

    emit({kind: 'stage', stage: 'plan', message: 'AI 正在构思大纲与版式设计…'})
    doTrace({event: 'plan_start', subject})
    let plan, fileText
    try {
        ({plan, fileText} = await genPPTDirectPlan(subject, options))
    } catch (e) {
        doTrace({event: 'error', message: `设计规划失败：${e.message || e}`})
        throw e
    }
    doTrace({event: 'plan_done', title: plan.title, total: plan.pages.length, genre: plan.design.genre, palette: plan.design.palette, fileChars: (fileText || '').length, ms: Date.now() - t0})

    const theme = {
        backgroundColor: plan.design.backgroundColor,
        themeColors: plan.design.palette,
        fontColor: plan.design.fontColor,
        fontName: plan.design.fontName,
    }
    const total = plan.pages.length
    emit({kind: 'meta', title: plan.title, theme, viewportSize: CANVAS_WIDTH, viewportRatio: VIEWPORT_RATIO, total, design: plan.design, traceCode: options.traceCode || undefined})

    const units = buildUnits(plan, granularity)
    const usedSlideIds = new Set()
    const results = new Array(units.length)
    const stats = {dropped: 0, lintPass: 0, lintWarn: 0, retries: 0, granularity, chapterCalls: 0, chapterFallbacks: 0, pageRegens: 0, renderOk: 0, renderFailed: 0, renderFallbacked: 0, unitTimeouts: 0}
    let nextGen = 0
    let nextFlush = 0
    let emittedIndex = 0

    async function flushReady() {
        while (nextFlush < units.length && results[nextFlush] !== undefined) {
            const slides = results[nextFlush] || []
            const unit = units[nextFlush]
            nextFlush++
            if (!slides.length) stats.dropped += unit.pageSpecs.length
            else stats.dropped += Math.max(0, unit.pageSpecs.length - slides.length)
            for (const slide of slides) {
                const issues = slide._lintIssues || []
                delete slide._lintIssues
                emit({kind: 'slide', index: emittedIndex, total, data: slide})
                emittedIndex++
                emit({kind: 'stage', stage: 'slide', index: emittedIndex, total, message: `已完成第 ${emittedIndex}/${total} 页`})
            }
        }
    }

    async function worker() {
        while (true) {
            const i = nextGen++
            if (i >= units.length) break
            const u = units[i]
            const before = {calls: _llmCalls, retries: stats.retries, regens: stats.pageRegens, t: Date.now()}
            let out = null
            try {
                /*单元级硬超时：渲染/上传/搜图/LLM任一环节悬挂都不能永久阻塞流水线*/
                out = await withTimeout(genOneUnit(plan, u, fileText, options, stats, usedSlideIds), options.unitTimeoutMs || 600000, `生成单元${i + 1}`)
            } catch (e) {
                if (e.message && e.message.includes('timeout after')) stats.unitTimeouts++
                logger.error('直出模式生成单元%s异常: %s', i + 1, e.message || e)
                out = []
            }
            results[i] = out || []
            doTrace({
                event: 'unit_done',
                unit: u.type,
                from: u.start + 1,
                to: u.start + u.pageSpecs.length,
                llmCalls: _llmCalls - before.calls,
                retries: stats.retries - before.retries,
                pageRegens: stats.pageRegens - before.regens,
                ms: Date.now() - before.t,
            })
            await flushReady()
        }
    }

    emit({kind: 'stage', stage: 'content', message: 'AI 正在逐页设计课件版式…'})
    const concurrency = options.concurrency || (granularity === 'chapter' ? Math.min(3, units.length) : 3)
    await Promise.all(Array.from({length: Math.min(concurrency, units.length)}, () => worker()))
    await flushReady()

    stats.llmCalls = _llmCalls - callsBefore
    const slides = results.flat()
    doTrace({
        event: 'done',
        title: plan.title,
        slides: slides.length,
        dropped: stats.dropped,
        renderOk: stats.renderOk,
        renderFallback: stats.renderFallbacked,
        renderFailed: stats.renderFailed,
        ms: Date.now() - t0,
    })
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
                granularity: options.granularity,
                maxPages: options.maxPages,
                pptCode: options.pptCode,
                pptTitle: options.pptTitle,
                operator: options.operator,
            },
            handleMode: options.handleMode || 'manual',
            toParentOutputKey: 'pptMeta',
        }]
    }
}
