import { describe, expect, it } from 'vitest'
import { readWebFile } from '@/testUtils/readWebFile'

/**
 * Source-level guards for the usage-meter UI.
 *
 * These are source assertions rather than mount tests on purpose: the two
 * invariants below are about module DEPENDENCIES and a wiring contract, which a
 * component test cannot observe (a mounted AppHeader would happily render while
 * quietly pulling ECharts into the first-paint bundle, and a capsule that never
 * reacts to the open request still looks fine until a notification is tapped).
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

const header = stripComments(readWebFile('src/components/common/AppHeader.vue'))
const popover = stripComments(readWebFile('src/components/common/UsageMeterPopover.vue'))

describe('usage meter — first-paint dependency guard', () => {
  it('AppHeader does not import ECharts (directly or via the stats chart module)', () => {
    // The stats panel lazy-loads ECharts; the header is on the critical path.
    // Importing statsChart from here would silently move the chart library into
    // the initial bundle — a regression no behavioural test can see.
    expect(header).not.toMatch(/from ['"]echarts/)
    expect(header).not.toMatch(/from ['"]@\/components\/stats\/statsChart/)
    expect(popover).not.toMatch(/from ['"]echarts/)
    expect(popover).not.toMatch(/from ['"]@\/components\/stats\/statsChart/)
  })

  it('the popover draws its curve with inline SVG rather than a chart library', () => {
    expect(popover).toContain('<svg')
    expect(popover).toContain('polyline')
  })
})

describe('usage meter — capsule wiring', () => {
  it('the capsule is gated on isWideScreen (no mobile header UI)', () => {
    // Mobile has no capsule by design: the meter is header-only and the phone
    // channel is the notification.
    expect(header).toMatch(
      /const showUsageMeter = computed\(\(\) => isWideScreen\.value && usageMeter\.hasData\.value\)/,
    )
    expect(header).toMatch(/v-if="showUsageMeter"/)
    // And NOT on `enabled`: an unconfigured user still gets a spend total, so
    // gating on the rule would hide the capsule for exactly the people who
    // never opened the settings page.
    expect(header).not.toMatch(/v-if="isWideScreen && usageMeter\.status\.value\.enabled"/)
  })

  it('the capsule sits after the layout controls and before the theme button', () => {
    // Right-hand control cluster: layout switch / shortcuts button → capsule →
    // theme → server. This pins the DOM order so a future element cannot sneak
    // in between unnoticed; the push to the right edge is the cluster
    // container's job (asserted in headerClusterSpacing.test.ts).
    const layout = header.indexOf('<HeaderLayoutSwitch')
    const capsule = header.indexOf('<UsageMeterPopover')
    const theme = header.indexOf('class="theme-quick-toggle"')
    expect(layout).toBeGreaterThan(-1)
    expect(capsule).toBeGreaterThan(-1)
    expect(theme).toBeGreaterThan(-1)
    expect(layout).toBeLessThan(capsule)
    expect(capsule).toBeLessThan(theme)
  })

  it('the push to the right edge is the cluster container, not any member', () => {
    // The auto margin used to float between the capsule (when rendered) and the
    // theme button (fallback) — a chain that drifted whenever a conditional
    // control appeared in only one of the two states. Now `.header-right-cluster`
    // ALWAYS renders and owns the header's single auto margin; no member may
    // carry its own.
    const cluster = header.slice(header.indexOf('.header-right-cluster {'))
    expect(cluster.slice(0, cluster.indexOf('}'))).toContain('margin-left: auto')

    const slot = header.slice(header.indexOf('.usage-meter-slot {'))
    expect(slot.slice(0, slot.indexOf('}'))).not.toContain('margin-left: auto')

    const themeRule = header.slice(header.indexOf('.theme-quick-toggle {'))
    expect(themeRule.slice(0, themeRule.indexOf('}'))).not.toContain('margin-left')
  })

  it('the per-capsule margin scheme stays retired', () => {
    // Tombstone: `header--has-meter` used to toggle the theme button's auto
    // margin. Reintroducing the class — or any second auto margin in the
    // header — would split the slack and strand the cluster mid-header again.
    expect(header).not.toContain('header--has-meter')
  })

  it('the popover reacts to the open request (notification tap)', () => {
    // A tap on a usage notification dispatches a window event; App.vue forwards
    // it to requestOpen(), and the popover must watch that counter. Without the
    // watch the tap opens nothing and the notification looks broken.
    expect(popover).toMatch(/watch\(\s*openRequest/)
  })

  it('App.vue forwards the notification tap to the meter', () => {
    const app = stripComments(readWebFile('src/App.vue'))
    expect(app).toContain("addEventListener('clawbench-open-usage-meter'")
    expect(app).toMatch(/function handleOpenUsageMeter/)
    // Narrow screens have no capsule, so the fallback must be the settings page —
    // and specifically the usage-meter category, which is its own settings entry
    // beside push notifications. Pointing at 'notification' would land the user
    // in the push-channel category, where the rule is not configured.
    expect(app).toMatch(/setPendingSettingsCategory\('usageMeter'\)/)
  })
})

describe('usage meter — notification channels', () => {
  it('the browser/system notification path handles usage_meter_update', () => {
    // Without this branch the event falls through to `else { return }` and
    // desktop/Electron never raise a system notification for a usage alert —
    // only Android and the IM channels would. The wording comes from the
    // payload, so the branch must read data.title / data.body.
    const src = stripComments(readWebFile('src/composables/useGlobalEvents.ts'))
    const at = src.indexOf("event === 'usage_meter_update'")
    expect(at).toBeGreaterThan(-1)

    const body = src.slice(at, at + 600)
    expect(body).toContain('data.title')
    expect(body).toContain('data.body')
    expect(body).toContain('clawbench-open-usage-meter')
  })

  it('the notification nav carries a usageMeter discriminator for the native shell', () => {
    // The Electron shell routes clicks by nav fields; without an explicit flag
    // it falls back to the session channel and drops the click.
    const src = stripComments(readWebFile('src/composables/useGlobalEvents.ts'))
    expect(src).toMatch(/usageMeter:\s*event === 'usage_meter_update'/)

    const native = stripComments(readWebFile('src/utils/clawbenchNative.ts'))
    expect(native).toMatch(/usageMeter\?:/)
  })
})

describe('usage meter capsule carries an icon and a word', () => {
  it('renders a gauge icon and a short label, not just numbers', () => {
    // A bar plus "12 / 20" does not say WHAT is measured. Sitting next to the
    // file and project badges it read as another file counter. The recent-project
    // rows solve this the same way: an icon followed by a word.
    const src = stripComments(readWebFile('src/components/common/UsageMeterPopover.vue'))
    expect(src).toMatch(/from 'lucide-vue-next'/)
    expect(src).toContain('<Gauge')
    expect(src).toContain('class="usage-label"')
    expect(src).toContain('t(metricLabelKey)')
  })

  it('the capsule word follows the configured metric, not a fixed "Usage"', () => {
    // A $20 budget and a 20-token budget used to be labelled identically, so
    // the word said nothing the number did not. Both surfaces that put a word
    // in front of the number must derive it from `status.metric`.
    for (const file of ['UsageMeterPopover.vue', 'SystemResourcesPanel.vue']) {
      const src = stripComments(readWebFile(`src/components/common/${file}`))
      expect(src, `${file} must derive its label from the metric`)
        .toContain('usageMeterMetricLabelKey(')
      expect(src).not.toContain("t('usageMeter.label')")
    }
  })

  it('both locales define a label and a title for every metric', () => {
    for (const loc of ['zh', 'en']) {
      const src = readWebFile(`src/i18n/locales/${loc}.ts`)
      for (const key of [
        'label',
        'title',
        'metricTokens',
        'metricCredit',
        'metricCost',
        'titleTokens',
        'titleCredit',
        'titleCost',
      ]) {
        expect(src, `${loc} missing usageMeter.${key}`)
          .toMatch(new RegExp(`\\b${key}:\\s*'[^']+'`))
      }
    }
  })

  it('the popover heading follows the metric instead of a fixed "Usage"', () => {
    const src = stripComments(readWebFile('src/components/common/UsageMeterPopover.vue'))
    expect(src).toContain('t(titleKey)')
    expect(src).not.toContain("t('usageMeter.title')")
  })
})

describe('usage meter — mobile entry to the rule', () => {
  it('the phone row is the entry point to the settings category', () => {
    // The capsule's "adjust" link is desktop-only. On a phone the resources row
    // is the only usage surface, so it must also reach the rule — otherwise the
    // number is unexplainable and unchangeable there.
    expect(header).toContain('@open-usage-settings="handleOpenUsageSettings"')
    expect(header).toMatch(/function handleOpenUsageSettings/)
    const at = header.indexOf('function handleOpenUsageSettings')
    const body = header.slice(at, at + 400)
    expect(body).toContain("setPendingSettingsCategory('usageMeter')")
    expect(body).toContain("switchTab?.('settings')")
    // The popover is teleported to <body>; leaving it open would float it over
    // the settings tab it just navigated to.
    expect(body).toContain('resourcesMenuOpen.value = false')

    const panel = stripComments(readWebFile('src/components/common/SystemResourcesPanel.vue'))
    expect(panel).toContain("$emit('open-usage-settings')")
    expect(panel).toContain("defineEmits(['switch-server', 'open-usage-settings'])")
  })
})

describe('usage meter — live number updates', () => {
  it('subscribes to the tick event, not only the threshold event', () => {
    // usage_meter_update means "a threshold was crossed" — every notification
    // surface fires for it. Using it for plain data changes would pop a system
    // notification after every completed turn. The capsule therefore needs its
    // own event, or it stays stale until the 5-minute worker or a manual open.
    const src = stripComments(readWebFile('src/composables/useUsageMeter.ts'))
    expect(src).toContain("'usage_meter_tick'")
    expect(src).toContain("'usage_meter_update'")
  })

  it('the backend broadcasts on change and skips an unchanged reading', () => {
    const src = stripComments(readWebFile('../internal/service/usage_meter.go'))
    expect(src).toContain('UsageMeterTickEventType = "usage_meter_tick"')
    expect(src).toMatch(/func broadcastUsageMeterNumbers\(/)
    // Called from the check path, so a completed turn reaches it.
    expect(src).toContain('broadcastUsageMeterNumbers(st)')
  })
})
