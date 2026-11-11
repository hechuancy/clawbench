import { describe, it, expect } from 'vitest'
import { readWebFile } from '@/testUtils/readWebFile'

// 守卫：会话侧栏是 content-area 层的独立列，与聊天窗格正交（解耦设计的锚点）。
describe('session sidebar decouple', () => {
  const APP = 'src/App.vue'

  it('mounts the session sidebar as a sibling of SplitView, not inside col-right', () => {
    const src = readWebFile(APP)
    const sidebar = src.indexOf('<SessionSidebar')
    expect(sidebar, 'SessionSidebar must exist').toBeGreaterThan(-1)
    // 在 SplitView 模板槽位之后、</main> 之前 = content-area 直子级
    const splitViewEnd = src.indexOf('</SplitView>')
    expect(sidebar).toBeGreaterThan(splitViewEnd)
    expect(sidebar).toBeLessThan(src.indexOf('</main>'))
  })

  it('keeps v-show gating on open && isWideScreen', () => {
    const src = readWebFile(APP)
    const tag = src.slice(src.indexOf('<SessionSidebar'), src.indexOf('/>', src.indexOf('<SessionSidebar')))
    expect(tag).toContain('v-show="sessionSidebar.open.value && isWideScreen"')
  })

  it('routes sidebar pointer/focus into the right pane (chat shortcuts stay alive)', () => {
    const src = readWebFile(APP)
    const tag = src.slice(src.indexOf('<SessionSidebar'), src.indexOf('>', src.indexOf('<SessionSidebar')))
    expect(tag).toContain('@pointerdown="onSidebarPointerDown"')
    expect(tag).toContain('@focusin="setActivePane(PANE_RIGHT)"')
  })

  it('sizes the split view and sidebar as flex siblings in wide mode', () => {
    const css = readWebFile('css/wide-screen.css')
    expect(css).toMatch(/\.main-content\.wide-screen \.content-area\s*\{[^}]*flex-direction:\s*row/)
    expect(css).toMatch(/\.main-content\.wide-screen \.content-area > \.split-view\s*\{[^}]*flex:\s*1 1 0/)
    expect(css).toMatch(/\.main-content\.wide-screen \.content-area > \.session-sidebar\s*\{[^}]*flex-shrink:\s*0/)
  })

  it('reveals the chat pane in handleSessionSelect before any guard', () => {
    const src = readWebFile(APP)
    const fnStart = src.indexOf('function handleSessionSelect')
    const body = src.slice(fnStart, src.indexOf('\n}', fnStart))
    const reveal = body.indexOf('if (isWideScreen.value && chatCollapsed.value)')
    expect(reveal, 'reveal must exist in handleSessionSelect').toBeGreaterThan(-1)
    const crossProject = body.indexOf('projectPath && projectPath !== store.state.projectRoot')
    const alreadyActive = body.indexOf('sessionId && sessionId === sessionIdentity.currentSessionId.value')
    expect(reveal, 'reveal must precede the cross-project branch').toBeLessThan(crossProject)
    expect(reveal, 'reveal must precede the already-active guard').toBeLessThan(alreadyActive)
    expect(body).toContain('setChatCollapsed(false)')
    expect(body).toContain('setActivePane(PANE_RIGHT)')
  })

  it('routes the session-list entry: wide → sidebar (reveal when open), narrow → drawer', () => {
    const src = readWebFile(APP)
    const start = src.indexOf('registerOpenSessionTabOverride(() => {')
    expect(start, 'the override must be a closure').toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf('})', start))
    expect(body).toContain('if (isWideScreen.value)')
    expect(body).toContain('sessionSidebarRef.value?.revealCurrent()')
    expect(body).toContain('sessionSidebar.openSidebar()')
    expect(body).toContain('sessionDrawer.open()')
    expect(body).not.toContain('openSessionTabBridge')
  })

  it('removed the chat rail and the file-header chat toggle for good', () => {
    const app = readWebFile(APP)
    expect(app).not.toContain('chat-rail')
    expect(app).not.toContain('has-chat-rail')
    expect(app).not.toContain('toggleChatPane')
    expect(app).not.toContain('toggle-maximize-pane')
    expect(readWebFile('src/components/file/FileHeader.vue')).not.toContain('toggleMaximizePane')
    // 布局开关是 v-for 渲染：钩子由 `layout-${opt.id}` 动态产出，守卫钉住
    // 绑定表达式本身 + 三个选项 id（运行时等价性由 e2e 点击 layout-* 钩子证明）。
    const hls = readWebFile('src/components/common/HeaderLayoutSwitch.vue')
    expect(hls).toContain(':data-action="`layout-${opt.id}`"')
    expect(hls).toContain("id: 'left' as LayoutId")
    expect(hls).toContain("id: 'split' as LayoutId")
    expect(hls).toContain("id: 'chat' as LayoutId")
  })
})
