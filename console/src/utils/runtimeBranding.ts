/**
 * 运行期品牌注入：部署级 Deployment env（APP_TITLE/APP_LOGO/APP_ICP/APP_COPYRIGHT）经容器启动
 * 脚本 99-modify-config.sh 替换 index.html 中 baked 的占位符（XXZX_/CW2PC_ 前缀均识别）。
 * 未注入（占位符残留/空值，含本地 dev）时返回空对象，走 defaultSettings/Footer 烤死值。
 */
const clean = (v: unknown) => (typeof v === 'string' && v && !/^(CW2PC|XXZX)_/.test(v) ? v : undefined)

export function getRuntimeBranding(): {title?: string; logo?: string} {
    const title = clean((window as any).APP_TITLE)
    const logo = clean((window as any).APP_LOGO)
    if (title) document.title = title
    const branding: {title?: string; logo?: string} = {}
    if (title) branding.title = title
    if (logo) branding.logo = logo
    return branding
}

/** 页脚备案号/版权的部署级覆盖：copyright 语义=权利主体段（年份仍动态） */
export function getRuntimeFooter(): {icp?: string; copyrightHolder?: string} {
    const branding: {icp?: string; copyrightHolder?: string} = {}
    const icp = clean((window as any).APP_ICP)
    const holder = clean((window as any).APP_COPYRIGHT)
    if (icp) branding.icp = icp
    if (holder) branding.copyrightHolder = holder
    return branding
}
