<template>
  <div class="header-layout-switch" role="group" :aria-label="t('appHeader.layoutSwitch')">
    <button
      v-for="opt in options"
      :key="opt.id"
      type="button"
      class="hls-opt"
      :class="{ 'hls-opt--active': activeId === opt.id }"
      :aria-pressed="activeId === opt.id"
      :title="opt.title"
      @click="opt.apply()"
    >
      <component :is="opt.icon" :size="14" />
      <span class="hls-opt-label">{{ opt.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageSquare, Columns2, PanelLeft } from 'lucide-vue-next'
import {
  useWideScreenLayout,
  setLeftCollapsed,
  setChatCollapsed,
  setActivePane,
  PANE_LEFT,
  PANE_RIGHT,
} from '@/composables/useWideScreenLayout'

// Wide-screen split layout only: on a phone the split does not exist and the
// control would be dead weight. Rendering is gated by the parent (AppHeader
// mounts it under `isWideScreen`); this module only reads/writes the same
// singleton state the split view itself consumes.
const { leftCollapsed, chatCollapsed } = useWideScreenLayout()
const { t } = useI18n()

/**
 * The three reachable layouts, one segment each. The setters carry the
 * mutual-exclusion invariants themselves (hiding chat re-opens the left pane
 * and vice versa), so "split" is the only state that must touch both — and
 * expanding one side already reads as "leave the other alone", which is why
 * apply() for a single pane only calls one setter when moving OUT of a
 * collapsed state.
 */
type LayoutId = 'left' | 'split' | 'chat'

const options = computed(() => [
  {
    id: 'left' as LayoutId,
    icon: PanelLeft,
    label: t('appHeader.layoutLeftPane'),
    title: t('appHeader.layoutLeftPaneTitle'),
    // Same focus routing the divider handles used to do: hiding chat moves
    // focus to the left pane so pane-aware shortcuts follow the visible pane.
    apply: () => { setChatCollapsed(true); setActivePane(PANE_LEFT) },
  },
  {
    id: 'split' as LayoutId,
    icon: Columns2,
    label: t('appHeader.layoutSplit'),
    title: t('appHeader.layoutSplitTitle'),
    // Expanding one pane is a no-op when already open, so this is idempotent.
    apply: () => { setChatCollapsed(false); setLeftCollapsed(false) },
  },
  {
    id: 'chat' as LayoutId,
    icon: MessageSquare,
    label: t('appHeader.layoutChat'),
    title: t('appHeader.layoutChatTitle'),
    apply: () => { setLeftCollapsed(true); setActivePane(PANE_RIGHT) },
  },
])

// Mirrors the setters' invariants: chat hidden ⇒ 左栏; left hidden ⇒ 聊天;
// neither ⇒ split. The guards make both-never-hold, so two reads suffice.
const activeId = computed<LayoutId>(() => {
  if (chatCollapsed.value) return 'left'
  if (leftCollapsed.value) return 'chat'
  return 'split'
})
</script>

<style scoped>
/* Echoes the header's badge-capsule visual language (border, --bg-secondary,
   --radius-full) so the control reads as part of the same family as the
   project/branch/file capsule it sits next to. Width is intrinsic — this is a
   control, NOT a filler (design-guide red line 3: never give a flex:1/filling
   container the header's drag exemption). */
.header-layout-switch {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  transition: background var(--duration-base), border-color var(--duration-base);
}

.hls-opt {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  height: calc(24 * var(--dp));
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  transition: color var(--duration-base), background var(--duration-base);
  white-space: nowrap;
}

.hls-opt + .hls-opt {
  /* Hairline between segments, same role as .badge-capsule-divider — drawn as
     a border so the parent's overflow:hidden keeps the round ends clipped. */
  border-left: 1px solid var(--border-color);
}

/* Active state mixes --text-primary INTO --bg-secondary rather than jumping to
   --bg-tertiary: 15 of 36 themes have near-zero secondary↔tertiary contrast
   (design-guide red line 4); the mix is correct by construction. */
.hls-opt--active {
  color: var(--accent-color);
  background: color-mix(in srgb, var(--text-primary) 8%, var(--bg-secondary));
}

@media (hover: hover) {
  .hls-opt:hover {
    color: var(--accent-color);
  }
}

.hls-opt:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: -2px;
}

.hls-opt svg {
  flex-shrink: 0;
}

.hls-opt-label {
  line-height: var(--line-height-snug);
}
</style>
