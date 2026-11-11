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
    <!-- 未读角标：竖条（chat rail）移除后，侧栏关着且聊天窗格隐藏时这里是
         唯一的未读提示面。侧栏开着时不显示——列表行自带未读角标；聊天窗格
         可见时也不显示——未读就地可见，按钮上再挂角标是噪音。 -->
    <span v-if="showUnreadBadge" class="count-badge session-sidebar-toggle-badge">{{ formatBadgeCount(store.state.chatUnreadCount) }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PanelRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useSessionSidebar } from '@/composables/useSessionSidebar'
import { useWideScreenLayout } from '@/composables/useWideScreenLayout'
import { store } from '@/stores/app.ts'
import { formatBadgeCount } from '@/utils/format'

/**
 * SessionSidebarToggle — the header's global entry to the pinned session
 * sidebar, and after the decoupling (docs/superpowers/specs/
 * 2026-11-11-session-sidebar-decouple-design.md) the ONE session-list form on
 * wide screens. The sidebar is a content-area-level column independent of the
 * chat pane, so this toggle is a PURE open/close flip: it never touches the
 * pane layout (the old "bring the host pane back first" dance existed only
 * because the sidebar used to live inside the chat pane and produced the
 * squeezed-middle state).
 *
 * Rendering is gated on `isWideScreen`: the pinned sidebar only exists in the
 * split layout, and on a phone the same list lives in the drawer/dock tab.
 */
const { isWideScreen, chatCollapsed } = useWideScreenLayout()
const sidebar = useSessionSidebar()
const { t } = useI18n()

// 解耦后侧栏在三种宽屏布局下都真实在屏：可见性就是 open 本身。
const sidebarVisible = computed(() => sidebar.open.value)

// 顶替竖条角标的唯一场景：侧栏关着且聊天窗格隐藏。两个条件缺一不可。
const showUnreadBadge = computed(() => store.state.chatUnreadCount > 0 && !sidebar.open.value && chatCollapsed.value)

function onToggle() {
  sidebar.toggleSidebar()
}
</script>

<style scoped>
/* Geometry follows the header's right-hand icon cluster (theme / server):
   transparent at rest, soft tertiary fill on hover, tight negative-margin tuck
   so the three icons read as one cluster. The active state is the design
   guide's "toggled on" recipe: accent ink on a 14% accent tint. */
.session-sidebar-toggle {
  position: relative;
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
/* 未读角标挂在图标右上角。几何用 --dp；配色完全交给全局 .count-badge
   （accent 背景 + bg-primary 前景），这里只管定位——36 主题下自设背景色
   必然踩对比度红线。 */
.session-sidebar-toggle-badge {
  position: absolute;
  top: calc(2 * var(--dp));
  right: 0;
  pointer-events: none;
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
