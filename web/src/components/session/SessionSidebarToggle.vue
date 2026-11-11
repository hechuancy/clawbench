<template>
  <button
    v-if="isWideScreen"
    type="button"
    class="session-sidebar-toggle"
    data-action="toggle-session-sidebar"
    :class="{ 'is-active': sidebarVisible }"
    :title="sidebarVisible ? t('session.closeSidebar') : t('session.openSidebar')"
    :aria-label="sidebarVisible ? t('session.closeSidebar') : t('session.openSidebar')"
    :aria-pressed="sidebarVisible"
    @click.stop="onToggle"
  >
    <PanelRight :size="18" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PanelRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useSessionSidebar } from '@/composables/useSessionSidebar'
import { useWideScreenLayout, setChatCollapsed } from '@/composables/useWideScreenLayout'

/**
 * SessionSidebarToggle — the header's global entry to the pinned session
 * sidebar. Until now the sidebar could only be reached from inside the chat
 * pane; this button raises session management to the app header (same pattern
 * as Cursor's panel toggles), so it is reachable in every wide-screen layout
 * state.
 *
 * Rendering is gated on `isWideScreen`: the pinned sidebar only exists in the
 * split layout, and on a phone the same list lives in the drawer/dock tab.
 */
const { isWideScreen, chatCollapsed } = useWideScreenLayout()
const sidebar = useSessionSidebar()
const { t } = useI18n()

// "Open" alone would lie while the chat pane is collapsed: the pinned sidebar
// lives inside that pane, so it stays mounted but is not painted. The active
// state (and the tooltip) must reflect what the user will actually see.
const sidebarVisible = computed(() => sidebar.open.value && !chatCollapsed.value)

function onToggle() {
  if (sidebarVisible.value) {
    sidebar.closeSidebar()
    return
  }
  // Opening from the header must bring its host pane back first, or the click
  // would flip the persisted state with nothing appearing on screen. The
  // setter carries the mutual-exclusion guards (same phrasing as the layout
  // switch: establish what must be open, then hide what must be hidden).
  if (chatCollapsed.value) setChatCollapsed(false)
  sidebar.openSidebar()
}
</script>

<style scoped>
/* Geometry follows the header's right-hand icon cluster (theme / server):
   transparent at rest, soft tertiary fill on hover, tight negative-margin tuck
   so the three icons read as one cluster. The active state is the design
   guide's "toggled on" recipe: accent ink on a 14% accent tint. */
.session-sidebar-toggle {
  padding: var(--space-5);
  margin-left: calc(-8 * var(--dp));
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-base), color 0.3s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
@media (hover: hover) {
  .session-sidebar-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
}
.session-sidebar-toggle.is-active {
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
}
.session-sidebar-toggle:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: -2px;
}
</style>
