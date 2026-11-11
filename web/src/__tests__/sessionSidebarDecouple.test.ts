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
})
