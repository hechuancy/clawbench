# 会话侧栏解耦与宽屏会话入口收窄 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会话侧栏从聊天窗格解耦为 `content-area` 层的独立列（三种宽屏布局开合一致，打开 = 只出列表不出聊天页），并收掉文件头显示聊天按钮、右缘竖条、抽屉固定按钮、宽屏抽屉形态四个冗余入口，修复 Header「+」左栏下不显示的问题。

**Architecture:** `SessionSidebar` 从 `.col-right` 内上移为 `.content-area` 的第二个 flex 子项，open 状态与布局正交（持久化不变）；点选列表行走 `handleSessionSelect` 里的 reveal（`setChatCollapsed(false)`，保持分栏）；宽屏 Ctrl+K / 输入条「会话」按钮经 `registerOpenSessionTabOverride` 分流到侧栏（已开则 `revealCurrent()` 滚动聚焦当前行），窄屏保留抽屉。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript，Vitest（jsdom），Playwright（chromium-coverage 单跑）。

**Spec:** `docs/superpowers/specs/2026-11-11-session-sidebar-decouple-design.md`（实现前必读，本计划按其「决定」节逐条落地）

## Global Constraints

- 几何尺寸一律 `calc(N * var(--dp))`（发丝线 `1px`）；共享 badge 复用 `.count-badge`，不自造样式（design-guide 红线）
- 对比度混合配方：`color-mix(in srgb, var(--text-primary) N%, var(--bg-secondary))`，禁止假设 `--bg-tertiary` 与 secondary 有对比度
- 前端日志只走 `appLog.*`；禁原始 `console.*`
- 删除 i18n key 前必须 `grep` 全仓确认无残余引用；中英 locale 同步删
- e2e 只跑 chromium-coverage，只跑本次新增/受影响的 spec；前置 `go build -o clawbench ./cmd/server && go build -o acp-mock ./cmd/acp-mock`
- 全量 vitest 与 `npm run build` 绝不并发（OOM）；每个任务只跑任务内指定的隔离测试
- 本分支最终合并回 `local`：Task 7 须在 `docs/dev/local_changes.md` 登记本次全部改动

## Review Focus

以下输入类/失败模式规格隐含但无任务测试直接覆盖，实现时逐条核对并落到所属任务的测试：

1. **侧栏开着时切换布局（左栏↔分栏↔聊天）**——列表必须保持可见且不产生窄缝。→ e2e `session_sidebar_decouple.spec.ts` 步骤 5（Task 6）
2. **点选跨项目会话**——reveal 必须发生在跨项目分支之前，否则 `hotSwitchProject` 异步切换期间聊天窗格仍隐藏。→ Task 3 源码守卫断言行序
3. **点过侧栏后的聊天快捷键**——侧栏根元素必须自带 `setActivePane(PANE_RIGHT)`，否则 Ctrl+K/Ctrl+←→ 在侧栏交互后静默失效。→ Task 1 源码守卫 + Task 6 e2e
4. **窄屏回归**——抽屉仍是窄屏唯一列表形态且 `openSessionTab` 窄屏路径不变、pin 按钮删除不破坏抽屉挂载。→ Task 4 的 `SessionDrawer.test.ts` / `useSessionIdentity.test.ts` 隔离跑
5. **旧 profile 侧栏默认 open=true**——解耦后左栏布局下首次出现列表列属预期行为（正交模型），关闭一次即持久化；不得为此改默认值。→ 仅人工核对，不写测试

---

### Task 1: 侧栏上移为 content-area 独立列（DOM/CSS + pane 归属）

**Files:**
- Modify: `web/src/App.vue`（模板 ~L89-96、~L290-402；script `onLeftPanePointerDown` ~L1273；样式 ~L5195-5204、~L5385-5472 区域暂只动侧栏相关）
- Modify: `web/css/wide-screen.css`（末尾追加规则）
- Create: `web/src/__tests__/sessionSidebarDecouple.test.ts`
- Modify: `web/src/__tests__/chatPaneCollapseAffordance.test.ts`（只删 3 个 stale 用例）

**Interfaces:**
- Consumes: Task 1 后侧栏已独立于聊天窗格；`store.state.chatUnreadCount`（`@/stores/app`）；`formatBadgeCount`（`@/utils/format`，旧 rail 角标同源）；`setActivePane` 不再被本组件使用（Task 1 已把 pane 归属移到 App.vue 侧栏挂载点）
- Produces: App.vue 内 `blurForeignInputs()`（从 `onLeftPanePointerDown` 提取的失焦部分，签名 `function blurForeignInputs(): void`；后续任务不改它）；`<SessionSidebar>` 的新挂载位置（content-area 直子级，Task 4 的 override 闭包依赖其 ref 不变）

- [ ] **Step 1: 写失败的守卫测试**（App.vue 无 mount 测试，走 source 守卫——仓库既有模式）

```ts
// web/src/__tests__/sessionSidebarDecouple.test.ts
import { describe, it, expect } from 'vitest'
import { readWebFile } from '@/testUtils/readWebFile'

// 守卫：会话侧栏是 content-area 层的独立列，与聊天窗格正交（解耦设计的锚点）。
describe('session sidebar decouple', () => {
  const APP = 'src/App.vue'

  it('mounts the session sidebar as a sibling of SplitView, not inside col-right', () => {
    const src = readWebFile(APP)
    const sidebar = src.indexOf('<SessionSidebar')
    expect(sidebar, 'SessionSidebar must exist').toBeGreaterThan(-1)
    // 在 SplitView 模板槽位之后、</main> 之前 = content-area 直子级
    const splitViewEnd = src.indexOf('</SplitView>')
    expect(sidebar).toBeGreaterThan(splitViewEnd)
    expect(sidebar).toBeLessThan(src.indexOf('</main>'))
  })

  it('keeps v-show gating on open && isWideScreen', () => {
    const src = readWebFile(APP)
    const tag = src.slice(src.indexOf('<SessionSidebar'), src.indexOf('/>', src.indexOf('<SessionSidebar')))
    expect(tag).toContain('v-show="sessionSidebar.open.value && isWideScreen"')
  })

  it('routes sidebar pointer/focus into the right pane (chat shortcuts stay alive)', () => {
    const src = readWebFile(APP)
    const tag = src.slice(src.indexOf('<SessionSidebar'), src.indexOf('>', src.indexOf('<SessionSidebar')))
    expect(tag).toContain('@pointerdown="onSidebarPointerDown"')
    expect(tag).toContain('@focusin="setActivePane(PANE_RIGHT)"')
  })

  it('sizes the split view and sidebar as flex siblings in wide mode', () => {
    const css = readWebFile('css/wide-screen.css')
    expect(css).toMatch(/\.main-content\.wide-screen \.content-area\s*\{[^}]*flex-direction:\s*row/)
    expect(css).toMatch(/\.main-content\.wide-screen \.content-area > \.split-view\s*\{[^}]*flex:\s*1 1 0/)
    expect(css).toMatch(/\.main-content\.wide-screen \.content-area > \.session-sidebar\s*\{[^}]*flex-shrink:\s*0/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run web/src/__tests__/sessionSidebarDecouple.test.ts`
Expected: FAIL（侧栏仍在 col-right 内、CSS 规则不存在）

- [ ] **Step 3: 实现**

1. App.vue 模板：把 `<SessionSidebar ref="sessionSidebarRef" …/>` 整块（~L383-397）从 `.col-right > .col-right-chat > .chat-panel-row` 内剪出，粘贴到 `</SplitView>` 之后、`</div><!-- content-area -->` 闭合之前，成为 SplitView 兄弟节点；props/handles 原样保留，并追加 `@pointerdown="onSidebarPointerDown"` 与 `@focusin="setActivePane(PANE_RIGHT)"`。
2. script：把 `onLeftPanePointerDown`（~L1273）中的 blur 段提取为 `blurForeignInputs()`（含 CodeMirror `.cm-content` 例外，原样搬运），`onLeftPanePointerDown` 改为 `setActivePane(PANE_LEFT); blurForeignInputs()`；新增 `function onSidebarPointerDown() { setActivePane(PANE_RIGHT); blurForeignInputs() }`。
3. `css/wide-screen.css` 末尾追加：

```css
/* 会话侧栏（.session-sidebar）是 content-area 的第二个 flex 子项——
   独立列，与 SplitView 的窗格互斥关系由 open 状态与 pane 布局正交表达。 */
.main-content.wide-screen .content-area {
  flex-direction: row;
}
.main-content.wide-screen .content-area > .split-view {
  flex: 1 1 0;
  min-width: 0;
}
.main-content.wide-screen .content-area > .session-sidebar {
  flex-shrink: 0;
}
```

4. `chatPaneCollapseAffordance.test.ts`：删除 3 个断言已不存在的 divider-handle 接线的用例——`wires BOTH divider handles to the collapse handler`、`routes each side to its own setter, through the shared guards`、`keeps the divider handle as the discoverable entry point`（`local` 分支上的预存过期失败；折叠入口已由 HeaderLayoutSwitch 接管，其行为由 `HeaderLayoutSwitch.test.ts` 守护）。其余 rail 用例保留（rail 到 Task 5 才移除）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run web/src/__tests__/sessionSidebarDecouple.test.ts web/src/__tests__/chatPaneCollapseAffordance.test.ts web/src/components/session/__tests__/SessionSidebar.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add web/src/App.vue web/css/wide-screen.css web/src/__tests__/sessionSidebarDecouple.test.ts web/src/__tests__/chatPaneCollapseAffordance.test.ts
git commit -m "feat(session): 会话侧栏上移为 content-area 独立列并归属右 pane"
```

---

### Task 2: SessionSidebarToggle 语义简化 + 未读角标

**Files:**
- Modify: `web/src/components/session/SessionSidebarToggle.vue`
- Modify: `web/src/components/session/__tests__/SessionSidebarToggle.test.ts`

**Interfaces:**
- Consumes: Task 1 后侧栏已独立于聊天窗格；`store.state.chatUnreadCount`（`@/stores/app`）；`formatBadgeCount` 不引入（本组件角标走 `.count-badge` 原始数字，与 chat-rail 旧实现一致地用 `formatBadgeCount`——从 `@/utils/format` 导入；若该 util 实际路径不同，以 `App.vue` 现有 import 为准）
- Produces: 组件行为契约「toggle 只翻侧栏开合，绝不触碰 `chatCollapsed`」；角标显隐条件 `chatUnreadCount > 0 && !open && chatCollapsed`（Task 6 e2e 依赖此条件）

- [ ] **Step 1: 改写测试**（先写失败断言）

保留现有 4 个基础用例，做两处改动：

1. 删除用例 `re-expands the collapsed chat pane before opening the sidebar`，替换为：

```ts
it('does NOT touch the chat pane in the left-pane layout — list only', async () => {
  // 解耦后侧栏独立于聊天窗格：左栏布局下点开关只翻侧栏开合，
  // 绝不展开聊天窗格（旧实现先 setChatCollapsed(false) 再开，产生窄缝）。
  setChatCollapsed(true)
  sidebar.openSidebar()
  const wrapper = mountToggle()
  // 打开的侧栏在任何布局下都算可见：active 态 + 关闭文案。
  expect(wrapper.find('[data-action="toggle-session-sidebar"]').classes()).toContain('is-active')

  await wrapper.find('[data-action="toggle-session-sidebar"]').trigger('click')
  await nextTick()

  expect(sidebar.open.value).toBe(false)
  expect(chatCollapsed.value).toBe(true, 'chat pane must stay hidden')
})
```

2. 新增角标用例：

```ts
it('shows the unread badge only while the sidebar is closed AND chat is hidden', async () => {
  // 置数：store.state.chatUnreadCount 是 plain ref 值，测试内直接赋值
  // （若 stores/app.ts 的实际形态需要 setter，用其等价写法，断言不变）。
  store.state.chatUnreadCount = 2
  setChatCollapsed(false)
  sidebar.closeSidebar()
  const wrapper = mountToggle()
  // 侧栏关、聊天窗格可见 → 不显示（聊天就地可见，角标是噪音）
  expect(wrapper.find('.session-sidebar-toggle-badge').exists()).toBe(false)
  setChatCollapsed(true)
  await nextTick()
  // 侧栏关 + 聊天隐藏 + 有未读 → 显示（顶替竖条的唯一场景）
  expect(wrapper.find('.session-sidebar-toggle-badge').exists()).toBe(true)
  // 侧栏开着 → 列表行自带未读角标，按钮角标退场
  sidebar.openSidebar()
  await nextTick()
  expect(wrapper.find('.session-sidebar-toggle-badge').exists()).toBe(false)
})
```

（测试文件需 import `store`（`@/stores/app`）与组件实现需 import `formatBadgeCount`（`@/utils/format`，与旧 rail 同源）——模板角标渲染 `formatBadgeCount(store.state.chatUnreadCount)`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run web/src/components/session/__tests__/SessionSidebarToggle.test.ts`
Expected: FAIL（旧实现会展开聊天窗格；角标不存在）

- [ ] **Step 3: 实现 `SessionSidebarToggle.vue`**

1. `sidebarVisible` 改为 `computed(() => sidebar.open.value)`（删 `&& !chatCollapsed`）。
2. `onToggle` 改为纯 `sidebar.toggleSidebar()`（删除 `setChatCollapsed(false)` 分支与 `chatCollapsed` 读取；`useWideScreenLayout` 仅保留 `chatCollapsed` 供角标条件使用）。
3. 模板按钮内追加角标：`<span v-if="showUnreadBadge" class="count-badge session-sidebar-toggle-badge">{{ store.state.chatUnreadCount }}</span>`，`showUnreadBadge = computed(() => store.state.chatUnreadCount > 0 && !sidebar.open.value && chatCollapsed.value)`；`<style scoped>` 内补 `.session-sidebar-toggle-badge { position: absolute; … }`（按钮加 `position: relative`，角标绝对定位在图标右上，几何用 `--dp`；配色直接复用全局 `.count-badge`，不自设背景色——36 主题红线）。
4. 组件注释同步改写（删除「opening from the header must bring its host pane back first」段，替换为「解耦后侧栏与聊天窗格正交」一段）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run web/src/components/session/__tests__/SessionSidebarToggle.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/session/SessionSidebarToggle.vue web/src/components/session/__tests__/SessionSidebarToggle.test.ts
git commit -m "feat(session): 侧栏开关纯 toggle 化并顶替竖条未读角标"
```

---

### Task 3: 点选会话 reveal 聊天窗格 + Header「+」修复

**Files:**
- Modify: `web/src/App.vue`（`handleSessionSelect` ~L2626）
- Modify: `web/src/components/session/SessionCreateButton.vue`（`goToChat` ~L47）
- Modify: `web/src/components/session/__tests__/SessionCreateButton.test.ts`
- Modify: `web/src/__tests__/sessionSidebarDecouple.test.ts`（追加源码守卫）

**Interfaces:**
- Consumes: `setChatCollapsed`/`setActivePane`/`PANE_RIGHT`（已有 import）；`chatCollapsed`/`isWideScreen` refs（App.vue 已解构）
- Produces: `handleSessionSelect` 的 reveal 契约（任何来源的点选——侧栏、抽屉、搜索——都先 reveal）；`SessionCreateButton` 的宽屏行为契约（创建后聊天窗格可见）

- [ ] **Step 1: 写失败测试**

1. `SessionCreateButton.test.ts`：现有「routes to chat」用例按新契约改写——宽屏下点击后断言 `chatCollapsed.value === false` 且 `switchTabSpy` **不**被调用；新增窄屏用例（`_setWideScreenForTest(false)`）断言 `switchTabSpy` 被调用。另外前置 `setChatCollapsed(true)` 模拟左栏布局。
2. `sessionSidebarDecouple.test.ts` 追加：

```ts
it('reveals the chat pane in handleSessionSelect before any guard', () => {
  const src = readWebFile(APP)
  const fnStart = src.indexOf('function handleSessionSelect')
  const body = src.slice(fnStart, src.indexOf('\n}', fnStart))
  const reveal = body.indexOf('if (isWideScreen.value && chatCollapsed.value)')
  expect(reveal, 'reveal must exist in handleSessionSelect').toBeGreaterThan(-1)
  const crossProject = body.indexOf('projectPath && projectPath !== store.state.projectRoot')
  const alreadyActive = body.indexOf("sessionId && sessionId === sessionIdentity.currentSessionId.value")
  expect(reveal, 'reveal must precede the cross-project branch').toBeLessThan(crossProject)
  expect(reveal, 'reveal must precede the already-active guard').toBeLessThan(alreadyActive)
  expect(body).toContain('setChatCollapsed(false)')
  expect(body).toContain('setActivePane(PANE_RIGHT)')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run web/src/components/session/__tests__/SessionCreateButton.test.ts web/src/__tests__/sessionSidebarDecouple.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

1. `App.vue` `handleSessionSelect` 函数体第一行插入：

```ts
// 解耦后侧栏可在聊天窗格隐藏时使用：点选行 = 「给我看这段对话」，
// 先 reveal（保持分栏，不收左栏）再做任何守卫分支——包括跨项目切换。
if (isWideScreen.value && chatCollapsed.value) {
  setChatCollapsed(false)
  setActivePane(PANE_RIGHT)
}
```

2. `SessionCreateButton.vue` `goToChat` 改为：

```ts
function goToChat() {
  // 宽屏 switchTab('chat') 早退（chat 不是左栏页签），创建的会话会落在
  // 背后——组件头注释明言创建是 chat 动作，必须展开聊天窗格（保持分栏）。
  if (isWideScreen.value) {
    if (chatCollapsed.value) setChatCollapsed(false)
    setActivePane(PANE_RIGHT)
    return
  }
  switchTab?.('chat')
}
```

（组件需从 `useWideScreenLayout` 额外解构 `chatCollapsed` 并 import `setChatCollapsed`、`setActivePane`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run web/src/components/session/__tests__/SessionCreateButton.test.ts web/src/__tests__/sessionSidebarDecouple.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/App.vue web/src/components/session/SessionCreateButton.vue web/src/components/session/__tests__/SessionCreateButton.test.ts web/src/__tests__/sessionSidebarDecouple.test.ts
git commit -m "feat(session): 点选/新建会话时展开聊天窗格，修复左栏下新建不可见"
```

---

### Task 4: 宽屏会话列表单形态——override 分流 + revealCurrent + 抽屉 pin 清理

**Files:**
- Modify: `web/src/App.vue`（~L1867-1871 的 override 块移到 `sessionSidebarRef` 声明之后 ~L2598；删 `@pin="handleDrawerPin"` ~L502 与 `handleDrawerPin` ~L2723）
- Modify: `web/src/components/session/SessionList.vue`（新增 expose `revealActive()`；滚动容器补 `tabindex="-1"`）
- Modify: `web/src/components/session/SessionSidebar.vue`（expose `revealCurrent()` 代理 `listRef.revealActive()`）
- Modify: `web/src/components/session/SessionDrawer.vue`（删 pin 按钮 ~L36-40、`PanelRight` import、`'pin'` emit）
- Modify: `web/src/composables/useSessionSidebar.ts`（删 `pinToSidebar`/`unpinToDrawer`/`openSessionTabBridge`/`registerOpenDrawer`/`openDrawerFn`）
- Modify: `web/src/composables/__tests__/useSessionSidebar.test.ts`（删 3 个用例）
- Modify: `web/src/i18n/__tests__/sessionHeaderKeys.test.ts`（keys 去掉 pinToSidebar/unpinToSidebar）
- Modify: `web/src/i18n/locales/en.ts`、`web/src/i18n/locales/zh.ts`（删 `session.pinToSidebar`/`session.unpinToSidebar`）
- Modify: `web/src/__tests__/sessionSidebarDecouple.test.ts`（追加 override 分流源码守卫）

**Interfaces:**
- Consumes: Task 1 的 `sessionSidebarRef` 挂载位置；Task 2 的纯 toggle
- Produces: `SessionSidebar` expose 面从 `{ loadSessions, addSessionLocally }` 扩为 `{ loadSessions, addSessionLocally, revealCurrent }`（Task 6 e2e 的 Ctrl+K 步骤依赖）；`useSessionSidebar` 公共面收窄为 `{ open, width, openSidebar, closeSidebar, toggleSidebar, setWidth, registerAddSessionLocally, addSessionLocally }`

- [ ] **Step 1: 写失败测试**

1. `useSessionSidebar.test.ts`：删除 `pinToSidebar opens sidebar`、`unpinToDrawer just collapses…`、`openSessionTabBridge opens the drawer…` 三个用例（API 即将移除）。
2. `sessionHeaderKeys.test.ts`：`HEADER_ACTION_KEYS` 去掉 `'pinToSidebar', 'unpinToSidebar'`。
3. `sessionSidebarDecouple.test.ts` 追加：

```ts
it('routes the session-list entry: wide → sidebar (reveal when open), narrow → drawer', () => {
  const src = readWebFile(APP)
  const start = src.indexOf('registerOpenSessionTabOverride(() => {')
  expect(start, 'the override must be a closure').toBeGreaterThan(-1)
  const body = src.slice(start, src.indexOf('})', start))
  expect(body).toContain('if (isWideScreen.value)')
  expect(body).toContain('sessionSidebarRef.value?.revealCurrent()')
  expect(body).toContain('sessionSidebar.openSidebar()')
  expect(body).toContain('sessionDrawer.open()')
  expect(body).not.toContain('openSessionTabBridge')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run web/src/composables/__tests__/useSessionSidebar.test.ts web/src/i18n/__tests__/sessionHeaderKeys.test.ts web/src/__tests__/sessionSidebarDecouple.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

1. `SessionList.vue`：滚动容器元素加 `tabindex="-1"`；`defineExpose` 增加：

```ts
/** Ctrl+K 在侧栏已开时的反馈：当前行滚入可视区并聚焦滚动容器。 */
function revealActive() {
  const row = scrollerEl.value?.querySelector?.('.session-item.active') as HTMLElement | null
  row?.scrollIntoView?.({ behavior: 'auto', block: 'nearest' })
  ;(scrollerEl.value as HTMLElement | null)?.focus?.({ preventScroll: true })
}
```

（`scrollerEl` 用该组件现有的滚动容器 ref；`.session-item.active` 类名来自 L101 的 `:class="{ active: … }"` 绑定——实现时以模板实际类名为准，语义不变。）

2. `SessionSidebar.vue`：`defineExpose({ loadSessions: …, addSessionLocally: …, revealCurrent: () => listRef.value?.revealActive() })`。
3. `App.vue`：把 L1867-1871 的三行移到 `const sessionSidebarRef = ref…`（~L2597-2598）之后，改为：

```ts
const sessionSidebar = useSessionSidebar()
// 会话列表唯一入口分流（设计 §4）：宽屏只认固定侧栏（已开则 reveal 当前
// 行而不是静默无操作），窄屏保留悬浮抽屉。
registerOpenSessionTabOverride(() => {
  if (isWideScreen.value) {
    if (sessionSidebar.open.value) sessionSidebarRef.value?.revealCurrent()
    else sessionSidebar.openSidebar()
    return
  }
  sessionIdentity.sessionDrawer.open()
})
```

（删掉原 `registerOpenDrawer(...)` 行与 `openSessionTabBridge` 引用。）

4. `useSessionSidebar.ts`：删除 `openDrawerFn`、`registerOpenDrawer`、`openSessionTabBridge`、`pinToSidebar`、`unpinToDrawer` 及 return 对象中的对应键。
5. `SessionDrawer.vue`：删 pin 按钮 `<template #actions-end>` 块、`PanelRight` import、emits 中的 `'pin'`。
6. `App.vue`：删 `@pin="handleDrawerPin"`（~L502）与 `function handleDrawerPin`（~L2723）。
7. locales：删 `session.pinToSidebar` / `session.unpinToSidebar`（先 `grep -rn "pinToSidebar\|unpinToSidebar" web/src` 确认删完测试与 locale 后无残余）。

- [ ] **Step 4: 跑测试确认通过 + 受影响组件回归**

Run: `npx vitest run web/src/composables/__tests__/useSessionSidebar.test.ts web/src/i18n/__tests__/sessionHeaderKeys.test.ts web/src/__tests__/sessionSidebarDecouple.test.ts web/src/components/session/__tests__/SessionDrawer.test.ts web/src/components/session/__tests__/SessionList.test.ts web/src/components/session/__tests__/SessionSidebar.test.ts web/src/composables/__tests__/useSessionIdentity.test.ts`
Expected: PASS（若 `SessionDrawer.test.ts` 有 pin 断言，随本任务更新为「无 pin 按钮」）

- [ ] **Step 5: Commit**

```bash
git add -A web/src
git commit -m "refactor(session): 宽屏会话列表收敛为侧栏单形态，删除抽屉 pin 与双皮入口"
```

---

### Task 5: 移除右缘竖条与文件头按钮 + 布局开关稳定钩子

**Files:**
- Modify: `web/src/App.vue`（删 rail 模板 ~L404-423、`.chat-rail*` CSS ~L5388-5463、`has-chat-rail` class 绑定 ~L89、`.content-area.has-chat-rail` ~L5470、`@toggle-maximize-pane="toggleChatPane"` ~L169、`toggleChatPane` ~L1261）
- Modify: `web/src/components/file/FileHeader.vue`（删按钮 ~L61-74 与 `toggleMaximizePane` emit；`PanelRightOpen/PanelRightClose` import 随删）
- Modify: `web/src/components/file/FileOverlay.vue`、`web/src/components/file/FileViewer.vue`（删 `toggleMaximizePane` 转发）
- Modify: `web/src/components/common/HeaderLayoutSwitch.vue`（三段补 `data-action="layout-left|layout-split|layout-chat"`）
- Modify: `web/src/i18n/locales/en.ts`、`zh.ts`（删 `nav.showChat`/`nav.hideChat`/`actionLabels.showChat`/`actionLabels.hideChat`，删前 grep）
- Modify: `web/src/components/file/__tests__/FileHeader.test.ts`（删 `collapse / restore chat pane button` describe 块 ~L314-384）
- Delete: `web/src/__tests__/chatPaneCollapseAffordance.test.ts`（Task 1 后剩余的 rail/FileHeader 断言随被删 UI 一起消亡；布局折叠行为由 `HeaderLayoutSwitch.test.ts` 守护）
- Modify: `web/src/__tests__/sessionSidebarDecouple.test.ts`（追加 absence 守卫）

**Interfaces:**
- Produces: e2e 稳定钩子 `[data-action="layout-split"]` 等（Task 6 依赖）；「rail/文件头按钮不存在」的回归红线

- [ ] **Step 1: 写失败测试**（追加到 `sessionSidebarDecouple.test.ts`）

```ts
it('removed the chat rail and the file-header chat toggle for good', () => {
  const app = readWebFile(APP)
  expect(app).not.toContain('chat-rail')
  expect(app).not.toContain('has-chat-rail')
  expect(app).not.toContain('toggleChatPane')
  expect(app).not.toContain('toggle-maximize-pane')
  expect(readWebFile('src/components/file/FileHeader.vue')).not.toContain('toggleMaximizePane')
  const hls = readWebFile('src/components/common/HeaderLayoutSwitch.vue')
  expect(hls).toContain('data-action="layout-left"')
  expect(hls).toContain('data-action="layout-split"')
  expect(hls).toContain('data-action="layout-chat"')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run web/src/__tests__/sessionSidebarDecouple.test.ts`
Expected: FAIL（rail 与按钮仍在）

- [ ] **Step 3: 实现**

按 Files 清单逐项删除；`MessageSquare` 等 lucide import 若仅 rail 使用则随删（`App.vue` 的 `MessageSquare` 另有 chat dock 使用，保留）。i18n 删 key 前 `grep -rn "showChat\|hideChat" web/src` 确认引用只剩 locale 与将删文件。

- [ ] **Step 4: 跑测试确认通过 + FileHeader 回归**

Run: `npx vitest run web/src/__tests__/sessionSidebarDecouple.test.ts web/src/components/file/__tests__/FileHeader.test.ts web/src/components/common/__tests__/HeaderLayoutSwitch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A web/src
git rm web/src/__tests__/chatPaneCollapseAffordance.test.ts
git commit -m "refactor(layout): 移除右缘竖条与文件头聊天开关，布局开关补稳定钩子"
```

---

### Task 6: e2e——page object 迁移 + 新 spec

**Files:**
- Modify: `e2e/pages/navigation.page.ts`（`switchToChat` 宽屏分支 ~L143-150）
- Modify: `e2e/specs/chat-scroll-memory.spec.ts`（~L33-36）、`e2e/specs/chat-scroll-streaming.spec.ts`（~L32-35）
- Modify: `e2e/specs/session-sidebar-toggle.spec.ts`（头注释 + 首个用例补左栏场景）
- Create: `e2e/specs/session_sidebar_decouple.spec.ts`

**Interfaces:**
- Consumes: Task 5 的 `[data-action="layout-split"]`；Task 2 的角标 hook `.session-sidebar-toggle-badge`；Task 4 的 `revealCurrent` 行为（e2e 以当前行滚入可视区间接断言）
- Produces: `NavigationPage.switchToChat()` 新契约（宽屏 = 点布局开关「分栏」段）

- [ ] **Step 1: 构建前置二进制**

Run: `go build -o clawbench ./cmd/server && go build -o acp-mock ./cmd/acp-mock`
Expected: 仓库根出现两个二进制（纯前端改动，二进制内容与 main 相同，只为 e2e server helper 复制用）

- [ ] **Step 2: 迁移 page object 与既有 spec**

1. `navigation.page.ts` `switchToChat` 宽屏分支改为：

```ts
if (wide) {
  // 布局开关「分栏」段：无论当前是左栏还是聊天布局，一次点击必达
  // 分栏（聊天窗格可见）。旧竖条入口已随解耦设计移除。
  const splitSeg = this.page.locator('[data-action="layout-split"]')
  if (await splitSeg.isVisible().catch(() => false)) {
    const textarea = this.page.locator('.chat-textarea')
    if (!(await textarea.isVisible().catch(() => false))) await splitSeg.click()
  }
  await expect(this.page.locator('.chat-textarea')).toBeVisible({ timeout: 10000 })
  return
}
```

2. 两个 chat-scroll spec：`beforeEach` 里的 rail 探测块替换为 `const nav = new NavigationPage(page); await nav.switchToChat()`（等价等待 `.chat-textarea` 可见，随后原有断言不变）。
3. `session-sidebar-toggle.spec.ts`：头注释第 4 点改写为新契约；首个用例追加左栏场景段——点击 `[data-action="layout-left"]` → 断言 `sidebar` 可见（若此前 open）且 `.chat-textarea` 不可见 → 点 toggle 两次验证开合且聊天窗格保持隐藏。

- [ ] **Step 3: 写新 spec `e2e/specs/session_sidebar_decouple.spec.ts`**

用例（全部 1440×900，chromium-coverage）：

1. 左栏布局（点 `layout-left`）→ 点 `[data-action="toggle-session-sidebar"]` → `.session-sidebar` 可见 **且** `.chat-textarea` 不可见（无窄缝的直接断言）。
2. 点选列表第一个非当前行 → `.chat-textarea` 可见、`layout-left` 段不处于 active（已进分栏）、聊天标题栏非 skeleton。
3. 再点 toggle → 侧栏不可见。
4. Ctrl+K（`page.keyboard.press('Control+k')`，先点一下聊天区域使 activePane=right）→ `.session-sidebar` 可见；再按一次 Ctrl+K → 无异常且当前行在可视区内（`expect(locator).toBeInViewport()`）。
5. 侧栏开着点 `layout-left` 再点 `layout-split`：侧栏全程可见（跨布局正交）。

- [ ] **Step 4: 跑 e2e**

Run: `npx playwright test --config e2e/playwright.config.ts --project=chromium-coverage e2e/specs/session_sidebar_decouple.spec.ts e2e/specs/session-sidebar-toggle.spec.ts e2e/specs/navigation.spec.ts e2e/specs/chat-scroll-memory.spec.ts e2e/specs/chat-scroll-streaming.spec.ts e2e/specs/chat-attach-picker.spec.ts e2e/specs/team-panel.spec.ts e2e/specs/session-stability.spec.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test(e2e): 会话侧栏解耦 spec 与受影响 page object/spec 迁移"
```

---

### Task 7: 收尾——全量单测、构建、台账

**Files:**
- Modify: `docs/dev/local_changes.md`（登记本次全部改动）

- [ ] **Step 1: 全量前端单测（串行，不与 build 并发）**

Run: `npm test`
Expected: 全绿（`chatPaneCollapseAffordance` 已删，不再有预存失败）

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 成功产出 `.clawbench-web/`（纯前端改动，disk 模式即时生效）

- [ ] **Step 3: 台账登记**

在 `docs/dev/local_changes.md` 增加条目：主题「会话侧栏解耦与宽屏会话入口收窄」、涉及文件（App.vue、SessionSidebar/Toggle/List/Drawer、FileHeader/Overlay/Viewer、HeaderLayoutSwitch、useSessionSidebar、wide-screen.css、i18n、e2e）、动机（左栏布局入口过多 + 侧栏寄生聊天窗格产生窄缝）、上游演进口径（若上游重排 App.vue 模板需按相同语义搬运 `<SessionSidebar>` 挂载点；rail/FileHeader 按钮若上游复刻需对照本设计）。

- [ ] **Step 4: Commit**

```bash
git add docs/dev/local_changes.md
git commit -m "docs(local): 登记会话侧栏解耦改动台账"
```
