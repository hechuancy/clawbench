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

  it('re-expands the collapsed chat pane before opening the sidebar', async () => {
    // The pinned sidebar lives inside the chat pane: with that pane collapsed
    // the sidebar stays mounted but is not painted, so "open" alone would be
    // a dead click — the toggle must bring the pane back first. This is the
    // same "establish what must be open" phrasing the layout switch uses.
    setChatCollapsed(true)
    sidebar.openSidebar()
    const wrapper = mountToggle()
    // Open but not visible: no active state, open-state wording.
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').classes()).not.toContain('is-active')
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').attributes('title')).toBe(OPEN_TITLE)

    await wrapper.find('[data-action="toggle-session-sidebar"]').trigger('click')
    await nextTick()

    expect(chatCollapsed.value).toBe(false, 'the host pane must be re-expanded')
    expect(sidebar.open.value).toBe(true, 'the sidebar must be open')
    expect(wrapper.find('[data-action="toggle-session-sidebar"]').classes()).toContain('is-active')
  })
})
