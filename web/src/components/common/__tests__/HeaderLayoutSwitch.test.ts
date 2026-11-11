import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import HeaderLayoutSwitch from '../HeaderLayoutSwitch.vue'
import {
  useWideScreenLayout,
  setLeftCollapsed,
  setChatCollapsed,
  resetWideScreenState,
  _setWideScreenForTest,
} from '@/composables/useWideScreenLayout'

// Partial mock: only useI18n is overridden; the component's import chain needs
// the real createI18n (same pattern as QuoteQuestionBar.test.ts).
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

// Drives the REAL layout singleton (no mock): the assertions cover both the
// rendered active segment and the singleton state the split view consumes,
// so a test cannot pass against state the rest of the app would not see.
const { leftCollapsed, chatCollapsed } = useWideScreenLayout()

function mountSwitch() {
  return mount(HeaderLayoutSwitch)
}

// Segments are looked up by their title, which under the identity `t` mock is
// exactly the i18n key — stable hooks, not positional indexes.
const TITLE_BY_ID = {
  left: 'appHeader.layoutLeftPaneTitle',
  split: 'appHeader.layoutSplitTitle',
  chat: 'appHeader.layoutChatTitle',
} as const

function segment(wrapper: ReturnType<typeof mountSwitch>, id: keyof typeof TITLE_BY_ID) {
  const segs = wrapper.findAll('.hls-opt')
  expect(segs, 'three layout segments must render').toHaveLength(3)
  const found = segs.find((s) => s.attributes('title') === TITLE_BY_ID[id])
  expect(found, `segment ${id} must exist`).toBeTruthy()
  return found!
}

beforeEach(() => {
  resetWideScreenState()
  _setWideScreenForTest(true)
  // The singleton's DEFAULT is left-collapsed (chat full width); every test
  // establishes its own baseline explicitly instead of relying on defaults.
  setLeftCollapsed(false)
  setChatCollapsed(false)
})

describe('HeaderLayoutSwitch', () => {
  it('marks split as the active layout when both panes are open', () => {
    const wrapper = mountSwitch()
    expect(chatCollapsed.value).toBe(false)
    expect(leftCollapsed.value).toBe(false)
    expect(segment(wrapper, 'split').classes()).toContain('hls-opt--active')
    expect(segment(wrapper, 'left').classes()).not.toContain('hls-opt--active')
  })

  it('collapses chat when the left-pane segment is clicked', async () => {
    const wrapper = mountSwitch()
    await segment(wrapper, 'left').trigger('click')
    await nextTick()

    expect(chatCollapsed.value).toBe(true, 'chat must collapse via the setter')
    expect(leftCollapsed.value).toBe(false, 'the setter re-opens the left pane')
    expect(segment(wrapper, 'left').classes()).toContain('hls-opt--active')
  })

  it('collapses the left pane when the chat segment is clicked', async () => {
    const wrapper = mountSwitch()
    await segment(wrapper, 'chat').trigger('click')
    await nextTick()

    expect(leftCollapsed.value).toBe(true, 'left pane must collapse via the setter')
    expect(segment(wrapper, 'chat').classes()).toContain('hls-opt--active')
  })

  it('restores both panes when the split segment is clicked from a collapsed layout', async () => {
    setChatCollapsed(true)
    const wrapper = mountSwitch()
    expect(segment(wrapper, 'left').classes()).toContain('hls-opt--active')

    await segment(wrapper, 'split').trigger('click')
    await nextTick()

    expect(chatCollapsed.value).toBe(false)
    expect(leftCollapsed.value).toBe(false)
    expect(segment(wrapper, 'split').classes()).toContain('hls-opt--active')
  })
})
