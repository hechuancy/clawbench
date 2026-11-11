<template>
  <div class="session-list-header-content">
    <div class="session-header-leading">
      <List :size="16" class="bs-header-icon" />
      <!-- Compact form: the title is decoration — the List glyph + the row's
           position already say "sessions" — and in English it alone is ~60px,
           which is exactly the slack a 220px sidebar lacks. Hosts whose width
           can go narrow (the pinned sidebar) pass `compact` to drop the text;
           the glyph stays. Hiding it never moves the button cluster: the title
           is left-anchored and the actions are pinned right by their auto
           margin, so the toggle is silent except for the text itself. -->
      <span v-if="!compact" class="bs-header-title">{{ t('session.title') }}</span>
    </div>
    <!-- Quota meter. Sits immediately left of the action row, in the
         right-hand cluster the actions' `margin-left: auto` defines. It used
         to be pseudo-centered between two equal-flex groups, but that trick
         needed a `min-width: min-content` floor on the actions to avoid
         overlapping them — and that floor is exactly what pinned the ActionBar
         at its labeled width, so its fold-to-menu never fired and a narrow
         sidebar clipped the trailing buttons instead. Content-sized groups
         need no floor; the meter rides along next to the buttons. -->
    <div v-if="sessionMaxCount > 0" class="session-counter">
      <div class="session-counter-bar">
        <div class="session-counter-fill" :style="{ width: sessionPct + '%', background: sessionBarColor }"></div>
        <span class="session-counter-text">{{ sessionCount }}/{{ sessionMaxCount }}</span>
      </div>
    </div>
    <!-- Icon-only row on purpose. The sidebar is capped at 480px, where four
         labeled buttons (~330dp) can never fit beside the meter and the title,
         so the ActionBar's "labels when room" deal never paid out here — and
         while the sidebar is being dragged, labels crossing their fit threshold
         pop in and out mid-drag. Icon-only keeps the row stable at every width:
         ~116dp fits all four buttons down to the 220px minimum, hover tooltips
         carry the wording, and the ActionBar's fold-to-menu (menu items are
         generated from the `title` attributes) stays as the last-resort
         overflow for extreme narrow widths (large UI scale). -->
    <ActionBar class="session-header-actions" mode="menu" align="end" size="bar">
      <slot name="actions" />
      <button class="header-action-btn" data-action="search" @click.stop="$emit('open-search')" :title="t('sessionSearch.title')" :aria-label="t('sessionSearch.title')">
        <Search :size="16" />
      </button>
      <button class="header-action-btn is-primary" data-action="create" @click.stop="$emit('create')" :title="t('session.newSession')" :aria-label="t('session.newSession')">
        <Plus :size="16" />
      </button>
      <template v-if="pinned">
        <RefreshButton :size="16" class="header-action-btn" data-action="refresh" :loading="refreshing" :disabled="refreshing" :title="t('session.refresh')" :aria-label="t('session.refresh')" @click.stop="triggerRefresh" />
      </template>
      <!-- Trailing slot: hosts put the sidebar pin/close toggle here so it is the
           right-most control in the header, after search/create/refresh. The
           leading #actions slot is rendered before the built-in buttons. -->
      <slot name="actions-end" />
    </ActionBar>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { List, Search, Plus } from 'lucide-vue-next'
import RefreshButton from '@/components/common/RefreshButton.vue'
import ActionBar from '@/components/common/ActionBar.vue'

const props = defineProps({
  sessionCount: { type: Number, default: 0 },
  sessionMaxCount: { type: Number, default: 0 },
  // When pinned (fixed sidebar), additionally show a manual refresh button.
  pinned: { type: Boolean, default: false },
  // Drop the decorative title text (keep the glyph). Hosts narrower than
  // ~280px cannot hold title + meter + the icon row — the title is the only
  // flexible piece, so it is the one that goes.
  compact: { type: Boolean, default: false },
  // Drives the refresh-button spin for the real load duration; the parent
  // (SessionSidebar) tracks this while its loadSessions() is in flight.
  refreshing: { type: Boolean, default: false },
})

const emit = defineEmits(['open-search', 'create', 'refresh'])

function triggerRefresh() {
  if (props.refreshing) return
  emit('refresh')
}

const { t } = useI18n()

const sessionPct = computed(() => props.sessionMaxCount > 0 ? Math.min((props.sessionCount / props.sessionMaxCount) * 100, 100) : 0)
const sessionBarColor = computed(() => {
  if (props.sessionCount >= props.sessionMaxCount && props.sessionMaxCount > 0) return '#ef4444'
  if (sessionPct.value >= 80) return '#f59e0b'
  return 'var(--accent-color, #0066cc)'
})
</script>

<style scoped>
/* Header content — a flex row: a content-sized leading group (icon + title),
   the fixed-width quota meter, and a content-sized actions group pushed to the
   right edge by `margin-left: auto`. Nothing is absolutely positioned and
   nothing floors at min-content: every group is shrinkable, so narrowing the
   sidebar degrades in order — title first (ellipsis → clipped), then the
   ActionBar folds buttons into its "more" menu. Used directly inside
   BottomSheet's own .bs-header (drawer) or a wrapper header provided by the
   sidebar, so it must be a self-contained flex container. */
.session-list-header-content {
  display: flex;
  align-items: center;
  gap: calc(3 * var(--dp));
  flex: 1;
  min-width: 0;
  width: 100%;
  white-space: nowrap;
  flex-wrap: nowrap;
  overflow: hidden;
}
.session-header-leading {
  /* `0 1 auto`, NOT `1 1 0`: content-sized and shrinkable, so the title gives
     way first when space runs short. The old equal-flex split needed a
     `min-width: min-content` floor on the actions group to keep the meter off
     the buttons — and that floor pinned the ActionBar at its labeled width, so
     it never shrank, never re-measured, never folded, and a narrow sidebar
     clipped the trailing buttons. Content-sized groups need no floor. */
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: calc(3 * var(--dp));
  /* The losing group clips rather than spilling under the meter; without it
     the icon box spills over the meter and reads as an overlap. */
  overflow: hidden;
}
.session-header-leading .bs-header-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* `flex: 0 0 auto` — the meter keeps its natural width; only the title and the
   action row absorb the width changes. */
.session-counter {
  flex: 0 0 auto;
}
.session-counter-bar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: calc(42 * var(--dp));
  height: calc(16 * var(--dp));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text-primary) 18%, transparent);
  overflow: hidden;
}
.session-counter-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width 0.3s ease, background 0.3s ease;
}
.session-counter-text {
  position: relative;
  z-index: 1;
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  color: #fff;
  line-height: 1;
  letter-spacing: calc(0.3 * var(--dp));
  text-shadow: 0 0 calc(2 * var(--dp)) rgba(0, 0, 0, 0.3);
}
/* Content-sized (`0 1 auto`) and pushed right by the auto margin — NOT
   `flex: 1` with a `min-width` floor. A floor defeats the ActionBar's folding:
   its ResizeObserver only sees the width changes that actually reach it, and a
   min-content floor swallows every shrink past the labeled width. Shrinkable
   is what lets the fold-to-menu fire when the header truly runs out of room. */
.session-header-actions {
  flex: 0 1 auto;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

</style>

<style>
/* Shared session-list header action buttons — unscoped so the same styling
   applies to buttons injected into the #actions slot by parents (e.g. the
   sidebar's unpin/close buttons and the drawer's pin button), which are
   rendered by the parent component, not by this one. */
/* Size, radius, colour, hover AND the gap between buttons come from the shared
   ActionBar row rules (size="bar"). The row is a utility row (search / create /
   refresh / pin / close) and stays neutral, with one deliberate exception:
     - `is-primary` marks the single create entry (the "+"), the one action the
       row wants to stand out — the same marking the task and proxy headers use.
   Painting any other button of the row in the accent is what this rule forbids:
   the accent used to make one or two utilities read as a different kind of
   control. The sidebar's pin/close button used to carry an accent tint as a
   "toggled on" state; it is a plain utility action like refresh, so it stays
   neutral now.

   This block used to add `margin-left: var(--space-3)` as well, which stacked on
   top of the bar's own 8px gap: the row measured 14px between buttons, and it
   got worse when the labels appeared (each button also gained 8px of side
   padding, so the visual gap read as even wider). The bar owns the spacing —
   nothing here should repeat it. */
.header-action-btn {
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

</style>
