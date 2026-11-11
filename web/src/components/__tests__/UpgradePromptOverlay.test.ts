import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UpgradePromptOverlay from '../UpgradePromptOverlay.vue'

// Partial mock: the component's import chain pulls in @/i18n, which needs the
// real createI18n — only useI18n is overridden (same pattern as
// QuoteQuestionBar.test.ts).
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

// The badge used to render `v{{ latestVersion }}` unconditionally, so a server
// reporting an already-prefixed version (local builds: "v0.138.0-…") displayed
// a doubled "vv0.138.0-…".
describe('UpgradePromptOverlay version badge', () => {
  it('does not double the v prefix when the version already carries one', async () => {
    const wrapper = mount(UpgradePromptOverlay)
    ;(wrapper.vm as unknown as { show: (l: string, c: string) => void }).show('v0.138.0-2-gabc', 'v0.138.0-2-gabc')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.up-version-badge').text()).toBe('v0.138.0-2-gabc')
  })

  it('prepends v to bare registry versions', async () => {
    const wrapper = mount(UpgradePromptOverlay)
    ;(wrapper.vm as unknown as { show: (l: string, c: string) => void }).show('0.139.0', '0.138.0')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.up-version-badge').text()).toBe('v0.139.0')
  })
})
