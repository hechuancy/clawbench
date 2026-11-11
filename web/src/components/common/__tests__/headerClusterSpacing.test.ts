import { describe, expect, it } from 'vitest'
import { readWebFile } from '@/testUtils/readWebFile'

/**
 * The header's right-hand control cluster is ONE container
 * (`.header-right-cluster`): layout switch → shortcuts button → usage capsule →
 * theme → server → session toggles (create / sidebar).
 *
 * The container owns the header's SINGLE `margin-left: auto`. The scheme it
 * replaced floated the auto margin between the usage capsule (when rendered)
 * and the theme button (fallback) — a chain that drifted on every screen where
 * the conditional members rendered differently, and that a third conditional
 * button (screen sharing, voice notes — both once lived here) kept breaking.
 * One always-rendered container ends that class of bug; in-cluster spacing is
 * the container's shared `gap`, with only the negative tucks on the tightly
 * paired icon buttons.
 *
 * Three invariants are worth pinning:
 *
 *  1. The push. `.header-right-cluster` carries the only `margin-left: auto`;
 *     no cluster member carries one of its own.
 *  2. Membership and order. The layout switch lives INSIDE the cluster (it is
 *     fixed-width like its neighbours — pinning the group right keeps the
 *     project/branch/file capsule free to grow on the left), ahead of the
 *     usage capsule; the session toggles sit at the end.
 *  3. No stray entries. The recording entry must not come back as a header
 *     button: the notes dock tab is its only home now.
 *
 * jsdom has no layout, so a mount test cannot measure this — the guard reads the
 * component source instead.
 */

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
}

const source = stripComments(readWebFile('src/components/common/AppHeader.vue'))
const template = source.slice(0, source.indexOf('<style'))

/** Declarations of the first rule whose selector is exactly `selector`. */
function declsOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `expected a rule for ${selector}`).not.toBeNull()
  return match![1]
}

function marginLeftOf(decls: string): string {
  return decls.match(/margin-left\s*:\s*([^;]+);/)?.[1].trim() ?? ''
}

describe('header right cluster — the container owns the push', () => {
  it('renders exactly one .header-right-cluster', () => {
    const count = template.match(/class="header-right-cluster"/g)?.length ?? 0
    expect(count).toBe(1)
  })

  it('carries the header\'s only margin-left: auto', () => {
    const cluster = declsOf('.header-right-cluster')
    expect(marginLeftOf(cluster)).toBe('auto')
    // The members that used to fight over this margin must not carry one.
    expect(marginLeftOf(declsOf('.theme-quick-toggle'))).toBe('')
    expect(marginLeftOf(declsOf('.usage-meter-slot'))).toBe('')
    expect(marginLeftOf(declsOf('.shortcuts-quick-toggle'))).toBe('')
  })

  it('contains the layout switch ahead of the usage capsule, session toggles last', () => {
    const clusterStart = template.indexOf('<div class="header-right-cluster">')
    const clusterEnd = template.indexOf('</div>', template.indexOf('<SessionSidebarToggle'))
    expect(clusterStart).toBeGreaterThan(-1)
    const layout = template.indexOf('<HeaderLayoutSwitch', clusterStart)
    const capsule = template.indexOf('<UsageMeterPopover', clusterStart)
    const theme = template.indexOf('class="theme-quick-toggle"', clusterStart)
    const sidebar = template.indexOf('<SessionSidebarToggle', clusterStart)
    for (const [name, at] of [['layout', layout], ['capsule', capsule], ['theme', theme], ['sidebar', sidebar]] as const) {
      expect(at, `${name} must be inside the cluster`).toBeGreaterThan(clusterStart)
      expect(at, `${name} must be inside the cluster`).toBeLessThan(clusterEnd)
    }
    expect(layout).toBeLessThan(capsule)
    expect(capsule).toBeLessThan(theme)
    expect(theme).toBeLessThan(sidebar)
  })
})

describe('header icon cluster — button contracts', () => {
  it('has exactly one .theme-quick-toggle button', () => {
    // A second one would inherit the theme button's spacing contract.
    const count = template.match(/class="theme-quick-toggle"/g)?.length ?? 0
    expect(count).toBe(1)
  })

  it('does not render a voice-notes entry', () => {
    // The dictaphone lives in the AI notes dock tab; a header shortcut would be
    // a second entry point with its own spacing problem.
    expect(template).not.toContain('solo-notes')
  })

  it('tucks the server button 8dp under the theme button', () => {
    // Same negative margin the cluster has always used; it is what makes the
    // icon rhythm tight instead of one `gap` wider than the rest of the header.
    expect(marginLeftOf(declsOf('.server-toggle'))).toBe('calc(-8 * var(--dp))')
  })
})

describe('header icon cluster — session-sidebar toggle', () => {
  const toggleSrc = stripComments(readWebFile('src/components/session/SessionSidebarToggle.vue'))

  it('appears exactly once in the header, after the server button', () => {
    const count = template.match(/<SessionSidebarToggle\s*\/>/g)?.length ?? 0
    expect(count, 'the toggle must be mounted once').toBe(1)
    const serverEnd = template.indexOf('class="server-toggle"')
    const toggleAt = template.indexOf('<SessionSidebarToggle')
    expect(toggleAt, 'the toggle must sit AFTER the server button in the cluster').toBeGreaterThan(serverEnd)
  })

  it('does not split the slack: no margin-left auto of its own', () => {
    // The cluster container owns the push; a second owner would strand the
    // cluster mid-header.
    expect(toggleSrc).not.toMatch(/margin-left:\s*auto/)
  })

  it('is wide-screen gated and exposes a stable action hook', () => {
    // The pinned sidebar only exists in the wide-screen split layout; on a
    // phone the toggle would be a dead control.
    expect(toggleSrc).toMatch(/v-if="isWideScreen"/)
    expect(toggleSrc).toMatch(/data-action="toggle-session-sidebar"/)
  })
})
