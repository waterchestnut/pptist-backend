/**
 * @fileOverview 原理演示兜底渲染器：渲染服务不可用时，用pptist原生元素在视频净空区内
 * 程序化生成"三帧分镜面板"（示意图形状+箭头线+说明文本/公式），入场动画由后级attachAnimations按邻近聚类自动编成逐帧点击序列
 * @author xianyang 2026-10-15
 * @module
 */

const CN_NAMES = {
    projectile: '抛体运动',
    force_analysis: '受力分析',
    lever: '杠杆平衡',
    derivation: '公式推导',
    limit: '极限逼近',
    wave: '行波',
    transform: '几何变换',
    reaction: '平衡移动',
}

const CAPTIONS = {
    projectile: ['发射：v₀沿抛射角', '最高点：v_y=0', '落地：对称回收'],
    force_analysis: ['重力 mg 竖直向下', '支持力 N 竖直向上', '拉力 F 与摩擦 f 平衡'],
    lever: ['加载：左端下沉', '越限：开始回摆', '平衡：F₁d₁=F₂d₂'],
    derivation: ['写出原式', '配方变形', '求出结论'],
    limit: ['ε 带较宽', 'ε 带收窄', 'n→∞ 时收敛于 L'],
    wave: ['t=0 初相位', 't=T/4 波形前移', 't=T/2 再前移'],
    transform: ['原始图形', '变换进行中', '变换结果与对应点连线'],
    reaction: ['初始平衡态', '增大反应物 A', '新平衡：产物增多'],
}

function uid() {
    return `el_fb_${(globalThis.crypto?.randomUUID?.() || String(Math.random())).replace(/-/g, '').substring(0, 10)}`
}

function shapeEl(path, box, color, fill = '#00000000') {
    return {
        type: 'shape', id: uid(), left: box.x, top: box.y, width: box.w, height: box.h, rotate: 0,
        viewBox: [box.w, box.h], path, fill,
        outline: {width: 2, style: 'solid', color},
    }
}

function lineEl(x, y, dx, dy, color, arrow = true) {
    return {
        type: 'line', id: uid(), left: x, top: y, start: [0, 0], end: [dx, dy], width: 2,
        style: 'solid', color, points: ['', arrow ? 'arrow' : ''],
    }
}

function textEl(text, box, color, fontsize = 12, align = 'center') {
    return {
        type: 'text', id: uid(), left: box.x, top: box.y, width: box.w, height: box.h, rotate: 0,
        content: `<p style="text-align:${align};"><span style="font-size:${fontsize}px;">${text}</span></p>`,
        defaultFontName: '', defaultColor: color, lineHeight: 1.2,
    }
}

function latexEl(latex, box, color) {
    return {
        type: 'latex', id: uid(), left: box.x, top: box.y, width: box.w, height: box.h, rotate: 0,
        latex, color,
    }
}

function rectPath(x, y, w, h) {
    return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`
}

function triPath(x, y, w, h) {
    return `M${x} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`
}

function dotPath(cx, cy, r) {
    return `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
}

function sinePath(w, h, phase, amp) {
    const pts = []
    const n = 24
    for (let i = 0; i <= n; i++) {
        const x = i / n * w
        const y = h / 2 - Math.sin(i / n * 4 * Math.PI + phase) * h * amp
        pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    return `M${pts.join(' L ')}`
}

/*每 kind 的三帧示意图构造器：返回每帧元素数组（frameBox 局部坐标）*/
const FRAMES = {
    projectile(p, c, color) {
        const els = [shapeEl('M2 ' + (c.h - 4) + ` Q ${c.w / 2} -8 ${c.w - 4} ${c.h - 4}`, {x: 0, y: 0, w: c.w, h: c.h}, color)]
        const t = [0.12, 0.5, 0.88][c.state]
        const x = 2 + t * (c.w - 4)
        const y = c.h - 4 - Math.sin(Math.PI * t) * (c.h - 12)
        els.push(shapeEl(dotPath(x, y, 5), {x: 0, y: 0, w: c.w, h: c.h}, color, color))
        if (c.state === 0) els.push(lineEl(x, y, c.w * 0.2, -c.h * 0.3, '#EF4444'))
        if (c.state === 1) els.push(lineEl(x + 10, y, c.w * 0.18, 0, '#EF4444'))
        if (c.state === 2) els.push(lineEl(x - 8, y - 2, c.w * 0.16, c.h * 0.22, '#EF4444'))
        return els
    },
    force_analysis(p, c, color) {
        const bx = c.w / 2 - 22, by = c.h / 2 - 12
        const els = [shapeEl(rectPath(bx, by, 44, 24), {x: 0, y: 0, w: c.w, h: c.h}, color, color + '33'),
            lineEl(c.w / 2, c.h / 2 + 12, 0, 16, '#EF4444')]
        if (c.state >= 1) els.push(lineEl(c.w / 2, c.h / 2 - 12, 0, -16, '#10B981'))
        if (c.state >= 2) {
            els.push(lineEl(c.w / 2 + 22, c.h / 2, 20, 0, color))
            els.push(lineEl(c.w / 2 - 22, c.h / 2, -18, 0, '#F59E0B'))
        }
        return els
    },
    lever(p, c, color) {
        const angles = [-12, -4, 0]
        const th = angles[c.state] * Math.PI / 180
        const cx = c.w / 2, cy = c.h / 2 - 6
        const dx = (c.w / 2 - 10) * Math.cos(th), dy = (c.w / 2 - 10) * Math.sin(th)
        return [lineEl(cx - dx, cy - dy, dx * 2, dy * 2, color, false),
            shapeEl(triPath(cx - 12, cy + 4, 24, 16), {x: 0, y: 0, w: c.w, h: c.h}, '#333333', '#333333'),
            shapeEl(dotPath(cx - dx, cy - dy, 5), {x: 0, y: 0, w: c.w, h: c.h}, '#EF4444', '#EF4444'),
            shapeEl(dotPath(cx + dx, cy + dy, 5), {x: 0, y: 0, w: c.w, h: c.h}, '#10B981', '#10B981')]
    },
    derivation(p, c, color) {
        const clean = s => String(s)
            .replace(/^\$+|\$+$/g, '')
            .replace(/\\begin\s*\{[^{}]*\}|\\end\s*\{[^{}]*\}/g, ' ')
            .replace(/&/g, ' ')
            .replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '')
            .replace(/\\\\/g, ' ')
            .trim()
        const steps = (p.steps && p.steps.length ? p.steps : [String.raw`ax^2+bx+c=0`, String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`])
            .map(clean).filter(s => s)
        const cur = steps[Math.min(steps.length - 1, c.state * Math.ceil(steps.length / 3))]
        const els = [latexEl(cur || 'f(x)', {x: c.w * 0.08, y: c.h * 0.1, w: c.w * 0.84, h: c.h * 0.7}, color)]
        if (c.state > 0) els.push(lineEl(c.w / 2, c.h * 0.85, 0, 8, '#999999'))
        return els
    },
    limit(p, c, color) {
        const eps = [0.34, 0.18, 0.08][c.state]
        const cx = c.w / 2, baseY = c.h * 0.62
        return [lineEl(6, baseY, c.w - 12, 0, '#333333', false),
            lineEl(cx, baseY - 8, 0, 16, '#EF4444', false),
            shapeEl(rectPath(cx - c.w * eps, baseY - 22, c.w * eps * 2, 44), {x: 0, y: 0, w: c.w, h: c.h}, color),
            shapeEl(dotPath(cx + c.w * eps * (c.state % 2 ? -0.7 : 0.7), baseY - 12, 3.5), {x: 0, y: 0, w: c.w, h: c.h}, color, color),
            shapeEl(dotPath(cx + c.w * eps * 0.3, baseY - 12, 3.5), {x: 0, y: 0, w: c.w, h: c.h}, color, color)]
    },
    wave(p, c, color) {
        const phase = [0, Math.PI / 2, Math.PI][c.state]
        const els = [shapeEl(sinePath(c.w - 8, c.h - 14, phase, 0.3), {x: 4, y: 4, w: c.w - 8, h: c.h - 10}, color)]
        els.push(shapeEl(dotPath(c.w * (0.25 + c.state * 0.02), c.h * 0.25, 4), {x: 0, y: 0, w: c.w, h: c.h}, '#EF4444', '#EF4444'))
        return els
    },
    transform(p, c, color) {
        const mode = p.mode || 'rotate'
        const base = [[8, c.h - 10], [c.w * 0.32, c.h - 10], [8, c.h * 0.42]]
        const f = [0, 0.55, 1][c.state]
        let mat
        if (mode === 'rotate') {
            const th = Math.PI / 2 * f
            mat = p2 => [c.w / 2 + (p2[0] - c.w / 2) * Math.cos(th) - (p2[1] - c.h / 2) * Math.sin(th), c.h / 2 + (p2[0] - c.w / 2) * Math.sin(th) + (p2[1] - c.h / 2) * Math.cos(th)]
        } else if (mode === 'reflect') {
            mat = p2 => [p2[0] * (1 - f) + (c.h - 1 - p2[1]) * f * 1 + f * (c.w - c.h), (c.h - 1 - p2[1]) * f + p2[1] * (1 - f)]
        } else {
            mat = p2 => [p2[0] + f * c.w * 0.5, p2[1] - f * c.h * 0.4]
        }
        const t = base.map(mat)
        const g = pts => `M${pts.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')} Z`
        return [shapeEl(g(base), {x: 0, y: 0, w: c.w, h: c.h}, '#999999'),
            shapeEl(g(t), {x: 0, y: 0, w: c.w, h: c.h}, color, color + '55'),
            lineEl(c.w * 0.34, c.h * 0.6, c.w * 0.18, -c.h * 0.1, color)]
    },
    reaction(p, c, color) {
        const counts = [[6, 4], [10, 4], [7, 8]][c.state]
        const rnd = i => [(i * 53 % 100) / 100, (i * 37 % 100) / 100]
        let dots = ''
        for (let i = 0; i < counts[0]; i++) { const [fx, fy] = rnd(i); dots += dotPath(8 + fx * (c.w * 0.4 - 12), 8 + fy * (c.h - 20), 3.5) + ' ' }
        let sq = ''
        for (let i = 0; i < counts[1]; i++) { const [fx, fy] = rnd(i + 20); sq += rectPath(c.w * 0.56 + fx * (c.w * 0.4), 6 + fy * (c.h - 22), 7, 7) + ' ' }
        return [shapeEl(rectPath(2, 2, c.w - 4, c.h - 4), {x: 0, y: 0, w: c.w, h: c.h}, '#333333'),
            lineEl(c.w / 2, 6, 0, c.h - 14, '#CCCCCC', false),
            shapeEl(dots.trim(), {x: 0, y: 0, w: c.w, h: c.h}, '#EF4444', '#EF4444'),
            shapeEl(sq.trim(), {x: 0, y: 0, w: c.w, h: c.h}, color, color)]
    },
}

/**
 * 在视频占位盒内构建三帧分镜面板（替代被移除的演示视频）
 * @param {{kind:string, params:Object}} spec demo规划
 * @param {{left,top,width,height}} box 视频占位盒（已由normalizeVideoBox归一档位）
 * @param {string[]} palette 主题色板
 * @returns {{elements: Array, groups: Array<string[]>}} 元素数组与动画分组（组序=点击出场序）
 */
export function buildDemoFallbackElements(spec, box, palette) {
    const builder = FRAMES[spec.kind]
    if (!builder) return {elements: [], groups: []}
    const color = (Array.isArray(palette) && palette[0]) || '#2563EB'
    const ink = '#333333'
    const els = []
    const groups = []
    /*外框卡片*/
    const frame = {
        type: 'shape', id: uid(), left: box.left, top: box.top, width: box.width, height: box.height, rotate: 0,
        viewBox: [box.width, box.height], path: rectPath(0, 0, box.width, box.height), fill: '#FFFFFF',
        outline: {width: 1.5, style: 'solid', color: color + '66'},
        shadow: {h: 2, v: 3, blur: 6, color: 'rgba(100,116,139,0.18)'},
        __frame: 'base',
    }
    els.push(frame)
    /*左上角标注：原理演示·xxx*/
    const badge = textEl(`原理演示 · ${CN_NAMES[spec.kind] || spec.kind}`, {x: box.left + 8, y: box.top + 4, w: 240, h: 22}, color, 12, 'left')
    badge.__frame = 'base'
    els.push(badge)
    groups.push([frame.id, badge.id])
    const horizontal = box.width / box.height > 2.05
    const pad = 10, capH = 26, gap = 6
    for (let s = 0; s < 3; s++) {
        let cell
        if (horizontal) {
            const cw = (box.width - pad * 2 - gap * 2) / 3
            cell = {x: box.left + pad + s * (cw + gap), y: box.top + pad + 18, w: cw, h: box.height - pad * 2 - 18}
        } else {
            const ch = (box.height - pad * 2 - gap * 2 - 18) / 3
            cell = {x: box.left + pad, y: box.top + pad + 18 + s * (ch + gap), w: box.width - pad * 2, h: ch}
        }
        const figH = cell.h - capH - 4
        const ctx = {x: cell.x, y: cell.y, w: cell.w, h: figH, state: s}
        let frag = []
        try {
            frag = builder(spec.params || {}, ctx, color) || []
        } catch (e) {
            frag = []
        }
        const groupIds = []
        /*局部坐标平移回页面坐标*/
        for (const el of frag) {
            el.left += ctx.x
            el.top += ctx.y
            el.__frame = s
            els.push(el)
            groupIds.push(el.id)
        }
        const cap = `${s + 1}. ${(CAPTIONS[spec.kind] || ['', '', ''])[s] || ''}`
        const capEl = textEl(cap, {x: cell.x, y: cell.y + figH + 2, w: cell.w, h: capH - 4}, ink, 12)
        capEl.__frame = s
        els.push(capEl)
        groupIds.push(capEl.id)
        groups.push(groupIds)
    }
    return {elements: els, groups}
}
