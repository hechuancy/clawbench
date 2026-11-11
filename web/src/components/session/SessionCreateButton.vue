<template>
  <button
    v-if="isWideScreen"
    type="button"
    class="session-create-toggle"
    data-action="create-session"
    :title="t('session.quickCreate')"
    :aria-label="t('session.quickCreate')"
    v-long-press="onPickAgent"
    @click.stop="onCreate"
    @contextmenu.prevent.stop="onPickAgent"
  >
    <Plus :size="18" />
  </button>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useSessionIdentity } from '@/composables/useSessionIdentity'
import { useWideScreenLayout } from '@/composables/useWideScreenLayout'

/**
 * SessionCreateButton — the header's direct "new session" entry. Creating a
 * session is the app's highest-frequency action, so it joins the system-level
 * cluster beside the sidebar toggle instead of living only in the chat pane.
 *
 * Same two-stroke contract as the chat pane's "+" button (they must not
 * diverge): tap = create with the DEFAULT agent (the common case), touch
 * long-press (v-long-press — the synthesized contextmenu is not reliable
 * enough to be the touch mechanism, and carries no long-pressing feedback or
 * click-through suppression) / right-click (contextmenu) = the agent selector
 * for picking another agent. openAgentSelector is idempotent (a drawer ref
 * set to true), so the mobile double-fire of both paths is harmless.
 *
 * Rendering is gated on `isWideScreen`: on a phone the composer's own "+" is
 * always one tap away and the header is too narrow to spend on a duplicate.
 */
const { isWideScreen } = useWideScreenLayout()
const identity = useSessionIdentity()
const { t } = useI18n()
// Creating a session is a chat action: if the user is on another tab (files,
// settings) the new session would otherwise land behind it, unread.
const switchTab = inject<(tab: string) => void>('switchTab')

function goToChat() {
  switchTab?.('chat')
}

async function onCreate() {
  // No agentId → the backend's default agent. identity.createSession has a
  // direct-API fallback, so this works even before ChatPanel registers its
  // bridge.
  await identity.createSession()
  goToChat()
}

function onPickAgent() {
  identity.openAgentSelector()
  goToChat()
}
</script>

<style scoped>
/* Geometry follows the header's right-hand icon cluster; accent ink marks the
   one high-frequency primary action (same grammar as the theme button). The
   negative margin tucks it into the dense icon triple server | create |
   sidebar. */
.session-create-toggle {
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
  color: var(--accent-color);
}
@media (hover: hover) {
  .session-create-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
}
.session-create-toggle:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: -2px;
}
</style>
