import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SessionCreateButton from '../SessionCreateButton.vue'
import { LongPressDirective } from '@/directives/longPress'
import {
  useSessionIdentity,
  registerSessionActions,
  registerSessionDrawerRef,
  resetIdentity,
} from '@/composables/useSessionIdentity'
import {
  useWideScreenLayout,
  resetWideScreenState,
  _setWideScreenForTest,
} from '@/composables/useWideScreenLayout'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

// Drive the REAL identity singleton: register the action bridges the same way
// App.vue / ChatPanel do, so the assertions cover what the rest of the app
// would actually see — not a mocked facade.
const createSession = vi.fn(async () => {})
const openAgentSelector = vi.fn(() => {})

beforeEach(() => {
  resetWideScreenState()
  _setWideScreenForTest(true)
  resetIdentity()
  createSession.mockClear()
  openAgentSelector.mockClear()
  registerSessionActions({
    switchSession: async () => {},
    createSession,
    archiveSession: async () => {},
    destroySession: async () => {},
    sendMessage: async () => {},
    openChatPanel: () => {},
    continueFromExecution: async () => false,
    checkContinueSession: async () => ({ exists: false, sessionId: '' }),
  })
  registerSessionDrawerRef({ openAgentSelector })
})

// App.vue provides the real switchTab; a spy here asserts the button routes
// the user to the chat tab after creating.
const switchTabSpy = vi.fn()

function mountButton() {
  return mount(SessionCreateButton, {
    global: {
      provide: {
        switchTab: switchTabSpy,
      },
      // The REAL directive: the touch long-press test drives it with raw touch
      // events + fake timers (the component binds v-long-press like the chat
      // pane's "+").
      directives: { 'long-press': LongPressDirective },
    },
  })
}

// jsdom has no Touch/TouchEvent constructor, so build a plain Event and stub
// `touches` on it — the directive only reads e.touches[0].{clientX,clientY}
// (same trick as directives/__tests__/longPress.test.ts).
function makeTouch(type: string, x: number, y: number): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'touches', { value: [{ clientX: x, clientY: y }] })
  return ev
}

describe('SessionCreateButton', () => {
  it('renders on a wide screen with a stable action hook and long-press wording', () => {
    const wrapper = mountButton()
    const btn = wrapper.find('[data-action="create-session"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('title')).toBe('session.quickCreate')
  })

  it('disappears on a narrow screen — the composer "+" is one tap away there', () => {
    _setWideScreenForTest(false)
    const wrapper = mountButton()
    expect(wrapper.find('[data-action="create-session"]').exists()).toBe(false)
  })

  it('tap creates a session with the DEFAULT agent (no agentId) and routes to chat', async () => {
    const wrapper = mountButton()
    await wrapper.find('[data-action="create-session"]').trigger('click')
    await nextTick()

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith(undefined)
    expect(switchTabSpy).toHaveBeenCalledWith('chat')
    expect(openAgentSelector).not.toHaveBeenCalled()
  })

  it('contextmenu (desktop right-click) opens the agent selector and routes to chat', async () => {
    const wrapper = mountButton()
    await wrapper.find('[data-action="create-session"]').trigger('contextmenu.prevent')
    await nextTick()

    expect(openAgentSelector).toHaveBeenCalledTimes(1)
    expect(switchTabSpy).toHaveBeenCalledWith('chat')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('touch long-press opens the agent selector (v-long-press, no contextmenu needed)', async () => {
    // Touch path: a 450ms hold must open the picker via the v-long-press
    // directive itself — the browser-synthesized contextmenu ~500ms into the
    // hold is not the touch mechanism. Dispatches ONLY touchstart + time, so
    // it fails if the button ever loses the directive binding.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = mountButton()
      const btn = wrapper.find('[data-action="create-session"]')
      btn.element.dispatchEvent(makeTouch('touchstart', 10, 10))
      vi.advanceTimersByTime(500)
      await nextTick()

      expect(openAgentSelector).toHaveBeenCalledTimes(1)
      expect(switchTabSpy).toHaveBeenCalledWith('chat')
      expect(createSession).not.toHaveBeenCalled()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})
