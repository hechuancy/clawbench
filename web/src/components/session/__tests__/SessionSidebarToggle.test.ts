import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SessionSidebarToggle from '../SessionSidebarToggle.vue'
import { useSessionSidebar } from '@/composables/useSessionSidebar'
import {
  useWideScreenLayout,
  setLeftCollapsed,
  setChatCollapsed,
  resetWideScreenState,
  _setWideScreenForTest,
} from '@/composables/useWideScreenLayout'
import { store } from '@/stores/app.ts'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

// Drives the REAL singletons (no mocks): the assertions cover both the
// rendered state and the singleton state the sidebar and the split view
// consume, so a test cannot pass against state the rest of the app would not
// see (same pattern as HeaderLayoutSwitch.test.ts).
const sidebar = useSessionSidebar()
const { chatCollapsed } = useWideScreenLayout()

function mountToggle() {
  return mount(SessionSidebarToggle)
}

const OPEN_TITLE = 'session.openSidebar'
const CLOSE_TITLE = 'session.closeSidebar'

beforeEach(() => {
  resetWideScreenState()
  _setWideScreenForTest(true)
  setLeftCollapsed(false)
  setChatCollapsed(false)
  // Establish the closed baseline explicitly instead of relying on the reset
  // order (the composable re-reads persisted state on its next init).
  sidebar.closeSidebar()
})

describe('SessionSidebarToggle', () => {
  it('renders on a wide screen with the open-state wording while the sidebar is hidden', () => {
    const wrapper = mountToggle()
    const btn = wrapper.find('[data-action="toggle-session-sidebar"]')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).not.toContain('is-active')
    expect(btn.attributes('title')).toBe(OPEN_TITLE)
    expect(btn.attributes('aria-pressed')).toBe('false')
  })

  it('disappears on a narrow screen — the pinned sidebar does not exist there', () => {
    _setWideScreenForTest(false)
    const wrapper = mountToggle()
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').exists()).toBe(false)
  })

  it('opens the sidebar on click and flips to the close-state wording', async () => {
    const wrapper = mountToggle()
    await wrapper.find('[data-action="toggle-session-sidebar"]').trigger('click')
    await nextTick()

    expect(sidebar.open.value).toBe(true)
    const btn = wrapper.find('[data-action="toggle-session-sidebar"]')
    expect(btn.classes()).toContain('is-active')
    expect(btn.attributes('title')).toBe(CLOSE_TITLE)
    expect(btn.attributes('aria-pressed')).toBe('true')
  })

  it('closes a visible sidebar on click', async () => {
    sidebar.openSidebar()
    const wrapper = mountToggle()
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').classes()).toContain('is-active')

    await wrapper.find('[data-action="toggle-session-sidebar"]').trigger('click')
    await nextTick()

    expect(sidebar.open.value).toBe(false)
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').classes()).not.toContain('is-active')
  })

  it('does NOT touch the chat pane in the left-pane layout — list only', async () => {
    // 解耦后侧栏独立于聊天窗格：左栏布局下点开关只翻侧栏开合，
    // 绝不展开聊天窗格（旧实现先 setChatCollapsed(false) 再开，产生窄缝）。
    setChatCollapsed(true)
    sidebar.openSidebar()
    const wrapper = mountToggle()
    // 打开的侧栏在任何布局下都算可见：active 态 + 关闭文案。
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').attributes('title')).toBe(CLOSE_TITLE)

    await wrapper.find('[data-action="toggle-session-sidebar"]').trigger('click')
    await nextTick()

    expect(sidebar.open.value).toBe(false)
    expect(chatCollapsed.value).toBe(true, 'chat pane must stay hidden')
  })

  it('shows the unread badge only while the sidebar is closed AND chat is hidden', async () => {
    // 置数：store.state.chatUnreadCount 是 plain reactive 属性，测试内直接赋值。
    store.state.chatUnreadCount = 2
    setChatCollapsed(false)
    sidebar.closeSidebar()
    const wrapper = mountToggle()
    // 侧栏关、聊天窗格可见 → 不显示（聊天就地可见，角标是噪音）
    expect(wrapper.find('.session-sidebar-toggle-badge').exists()).toBe(false)
    setChatCollapsed(true)
    await nextTick()
    // 侧栏关 + 聊天隐藏 + 有未读 → 显示（顶替竖条的唯一场景）
    expect(wrapper.find('.session-sidebar-toggle-badge').exists()).toBe(true)
    // 侧栏开着 → 列表行自带未读角标，按钮角标退场
    sidebar.openSidebar()
    await nextTick()
    expect(wrapper.find('.session-sidebar-toggle-badge').exists()).toBe(false)
  })
})
