import { ref, watch } from 'vue'
import {
  DEFAULT_SESSION_SIDEBAR_WIDTH,
  layoutEpoch,
  readPanelState,
  writePanelState,
  type SessionSidebarState,
} from '@/utils/panelState'

export const SIDEBAR_DEFAULT_WIDTH = DEFAULT_SESSION_SIDEBAR_WIDTH
export const SIDEBAR_MIN_WIDTH = 220
export const SIDEBAR_MAX_WIDTH = 480

export interface SidebarSession {
  id: string
  title?: string
  backend?: string
  agentId?: string
  model?: string
  /** Pagination cursor source — backend orders/filters paged sessions by created_at. */
  createdAt?: string
  updatedAt?: string
  unreadCount?: number
}

const open = ref(true)
const width = ref(SIDEBAR_DEFAULT_WIDTH)
let addLocallyFn: ((session: SidebarSession) => void) | null = null
let initialized = false
let stopEpochWatch: (() => void) | null = null

function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return SIDEBAR_DEFAULT_WIDTH
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(w)))
}

function load() {
  // Key name, scope and JSON encoding are owned by the panel-state registry.
  // Clamping stays here: it is a business rule about this sidebar, not a
  // storage concern.
  const stored = readPanelState<SessionSidebarState>('sessionSidebar')
  open.value = stored.open === true
  width.value = clampWidth(stored.width)
}

function persist() {
  writePanelState('sessionSidebar', { open: open.value, width: width.value })
}

export function useSessionSidebar() {
  if (!initialized) {
    initialized = true
    load()
    // Re-read when the layout-memory scope or the project root changes — this
    // module loads once per session, so without the epoch the setting would only
    // take effect after a reload. Stopped first so a test reset (which clears
    // `initialized`) cannot accumulate one watcher per init.
    stopEpochWatch?.()
    stopEpochWatch = watch(layoutEpoch, load)
  }

  function openSidebar() {
    open.value = true
    persist()
  }
  function closeSidebar() {
    open.value = false
    persist()
  }
  function toggleSidebar() {
    if (open.value) {
      closeSidebar()
    } else {
      openSidebar()
    }
  }
  function setWidth(w: number) {
    width.value = clampWidth(w)
    persist()
  }
  function registerAddSessionLocally(fn: (session: SidebarSession) => void) {
    addLocallyFn = fn
  }
  function addSessionLocally(session: SidebarSession) {
    addLocallyFn?.(session)
  }

  return {
    open,
    width,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    setWidth,
    registerAddSessionLocally,
    addSessionLocally,
  }
}

/** Test hook — reset module state. */
export function _resetForTest() {
  initialized = false
  stopEpochWatch?.()
  stopEpochWatch = null
  open.value = true
  width.value = SIDEBAR_DEFAULT_WIDTH
  addLocallyFn = null
}
