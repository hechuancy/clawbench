import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SessionListHeader from '@/components/session/SessionListHeader.vue'
import { readWebFile } from '@/testUtils/readWebFile'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'en' } }),
}))

function mountHeader(props = {}) {
  return mount(SessionListHeader, {
    props: { sessionCount: 0, sessionMaxCount: 10, ...props },
  })
}

describe('SessionListHeader', () => {
  it('renders counter when maxCount > 0', () => {
    const wrapper = mountHeader({ sessionCount: 5, sessionMaxCount: 10 })
    expect(wrapper.find('.session-counter').exists()).toBe(true)
  })

  it('does not render counter when maxCount is 0', () => {
    const wrapper = mountHeader({ sessionMaxCount: 0 })
    expect(wrapper.find('.session-counter').exists()).toBe(false)
  })

  it('renders default action buttons (search + create)', async () => {
    const wrapper = mountHeader()
    const search = wrapper.find('.header-action-btn[data-action="search"]')
    const create = wrapper.find('.header-action-btn[data-action="create"]')
    expect(search.exists()).toBe(true)
    expect(create.exists()).toBe(true)
  })

  it('emits open-search when search clicked', async () => {
    const wrapper = mountHeader()
    await wrapper.find('.header-action-btn[data-action="search"]').trigger('click')
    expect(wrapper.emitted('open-search')).toBeTruthy()
  })

  it('emits create when create clicked', async () => {
    const wrapper = mountHeader()
    await wrapper.find('.header-action-btn[data-action="create"]').trigger('click')
    expect(wrapper.emitted('create')).toBeTruthy()
  })

  it('no longer renders a separate create-group button', () => {
    // Group creation merged into the create page (single/group switch there), so
    // the session-list header must not keep a standalone group entry.
    const wrapper = mountHeader()
    expect(wrapper.find('[data-action="create-group"]').exists()).toBe(false)
    expect(wrapper.emitted('create-group')).toBeUndefined()
  })

  it('renders a leading extra button passed via slot', () => {
    const wrapper = mount(SessionListHeader, {
      props: { sessionCount: 0, sessionMaxCount: 0 },
      slots: { actions: '<button class="pin-stub" />' },
    })
    expect(wrapper.find('.pin-stub').exists()).toBe(true)
  })

  it('renders the trailing actions-end slot AFTER the built-in buttons', () => {
    // The sidebar's pin/unpin toggle goes here so it is the right-most control.
    // Order is the whole point: a button that renders first is not "right-most".
    const wrapper = mount(SessionListHeader, {
      props: { sessionCount: 0, sessionMaxCount: 0, pinned: true },
      slots: {
        actions: '<button class="leading-stub" />',
        'actions-end': '<button class="trailing-stub" />',
      },
    })
    const buttons = wrapper.findAll('.session-header-actions button')
    const classes = buttons.map((b) => b.classes())
    const trailingIdx = classes.findIndex((c) => c.includes('trailing-stub'))
    const searchIdx = classes.findIndex((c) => c.includes('header-action-btn'))
    expect(trailingIdx).toBeGreaterThan(-1)
    expect(searchIdx).toBeGreaterThan(-1)
    // Trailing slot is the last button; every built-in (search/create/refresh)
    // comes before it.
    expect(trailingIdx).toBe(buttons.length - 1)
    expect(trailingIdx).toBeGreaterThan(searchIdx)
  })

  it('lays the header out content-sized and right-packed, with NO min-content floor on the actions', () => {
    // jsdom does not lay out, so the layout contract is pinned at the source.
    // The old contract — equal-flex pseudo-centering plus a
    // `min-width: min-content` floor on the actions — was the clipping bug:
    // the floor pinned the ActionBar at its labeled width, so it never
    // shrank, its ResizeObserver never fired, its fold-to-menu never ran, and
    // a narrow sidebar clipped the trailing buttons at the header's own
    // `overflow: hidden` instead. The current contract: every group is
    // content-sized and shrinkable, the actions are pushed right by an auto
    // margin, and degradation happens in order (title → ActionBar fold).
    const src = readWebFile('src/components/session/SessionListHeader.vue')

    const ruleFor = (selector: string) => {
      const start = src.indexOf(selector + ' {')
      expect(start, `${selector} rule must exist`).toBeGreaterThan(-1)
      return src.slice(start, src.indexOf('}', start))
    }

    // The meter must NOT be absolutely positioned.
    expect(ruleFor('.session-counter')).not.toMatch(/position:\s*absolute/)

    // The leading group gives way first: content-sized, shrinkable, and
    // clipping (not spilling under the meter) when it has lost.
    const leadingRule = ruleFor('.session-header-leading')
    expect(leadingRule).toMatch(/flex:\s*0 1 auto/)
    expect(leadingRule).toMatch(/min-width:\s*0/)
    expect(leadingRule).toMatch(/overflow:\s*hidden/)

    // The actions row is content-sized, pushed right by the auto margin, and —
    // the actual regression — carries NO `min-width: min-content` floor, which
    // is what used to defeat the ActionBar's folding.
    const actionsRule = ruleFor('.session-header-actions')
    expect(actionsRule).toMatch(/flex:\s*0 1 auto/)
    expect(actionsRule).toMatch(/margin-left:\s*auto/)
    expect(actionsRule).not.toMatch(/min-width:\s*min-content/)
  })

  it('when pinned, keeps search/create and also shows a refresh button', () => {
    const wrapper = mountHeader({ pinned: true })
    expect(wrapper.find('.header-action-btn[data-action="search"]').exists()).toBe(true)
    expect(wrapper.find('.header-action-btn[data-action="create"]').exists()).toBe(true)
    expect(wrapper.find('.header-action-btn[data-action="refresh"]').exists()).toBe(true)
  })

  it('compact form drops the title text but keeps the glyph, meter and every button', () => {
    // Below ~280px the sidebar cannot hold the (locale-dependent!) title text
    // beside the meter and the icon row — the English "Sessions" alone is
    // ~60px, which is exactly the slack a 220px sidebar lacks (measured in
    // e2e: the ActionBar folded refresh into the "more" menu). The compact
    // form is the host's explicit narrow signal: ONLY the title text goes.
    const wrapper = mountHeader({ sessionMaxCount: 10, pinned: true, compact: true })
    expect(wrapper.find('.session-header-leading .bs-header-title').exists()).toBe(false)
    expect(wrapper.find('.session-header-leading .bs-header-icon').exists()).toBe(true)
    // The meter and the built-in buttons are NOT part of what compact removes.
    expect(wrapper.find('.session-counter').exists()).toBe(true)
    for (const action of ['search', 'create', 'refresh']) {
      expect(wrapper.find(`.header-action-btn[data-action="${action}"]`).exists()).toBe(true)
    }
  })

  it('emits refresh when the pinned refresh button is clicked', async () => {
    const wrapper = mountHeader({ pinned: true })
    await wrapper.find('.header-action-btn[data-action="refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toBeTruthy()
  })

  it('shows the spinning feedback driven by the refreshing prop', async () => {
    const wrapper = mountHeader({ pinned: true })
    const btn = wrapper.find('.header-action-btn[data-action="refresh"]')
    expect(btn.classes()).not.toContain('refresh-spin--active')

    await btn.trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)

    // Parent sets refreshing=true while its loadSessions() is in flight
    await wrapper.setProps({ refreshing: true })
    expect(btn.classes()).toContain('refresh-spin--active')

    // Double-click while refreshing is ignored
    await btn.trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)

    // Refresh completes → spin ends
    await wrapper.setProps({ refreshing: false })
    expect(btn.classes()).not.toContain('refresh-spin--active')
  })
})

describe('SessionListHeader — icon-only built-ins', () => {
  it('renders the built-in buttons WITHOUT text labels', () => {
    // The sidebar is capped at 480px, where four labeled buttons can never fit
    // beside the meter and the title, so the built-ins are icon-only on
    // purpose: ~116dp of icons fits every width down to the 220px minimum, and
    // labels popping in/out mid-drag cannot happen. The wording lives in the
    // title/aria-label; the ActionBar fold-to-menu generates its menu items
    // from those same titles.
    const wrapper = mountHeader({ pinned: true })
    expect(wrapper.findAll('.header-action-btn .action-label').length).toBe(0)
    for (const action of ['search', 'create', 'refresh']) {
      const btn = wrapper.find(`.header-action-btn[data-action="${action}"]`)
      expect(btn.exists()).toBe(true)
      expect(btn.attributes('aria-label'), `${action} must keep an accessible name`).toBeTruthy()
    }
  })
})

describe('SessionListHeader — slot buttons', () => {
  it('host-injected labeled buttons still follow the ActionBar label contract', async () => {
    // The header's own buttons are icon-only, but the slots stay open to host
    // buttons (a future entry with a label). Those must still be shown/hidden
    // by the shared `.ab--labels` class rather than styled ad hoc.
    const wrapper = mount(SessionListHeader, {
      props: { sessionCount: 0, sessionMaxCount: 10 },
      slots: {
        actions: '<button class="header-action-btn"><span class="action-label">已分享</span></button>',
        'actions-end': '<button class="header-action-btn"><span class="action-label">固定</span></button>',
      },
    })
    // jsdom has no layout, so the bar measures 0 wide and assumes there is
    // room — the wide-header case. The measure/overflow maths lives in
    // ActionBar.test.ts; this pins the wiring.
    await nextTick()
    const bar = wrapper.find('.session-header-actions')
    expect(bar.classes()).toContain('ab--labels')
    expect(wrapper.findAll('.header-action-btn .action-label').length).toBe(2)
  })
})
