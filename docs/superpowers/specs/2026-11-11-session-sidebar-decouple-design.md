# 会话侧栏解耦与宽屏会话入口收窄 — 设计文档

日期：2026-11-11
状态：待批准
范围：纯前端（`web/src/`），无后端改动

## 背景与动机

宽屏（≥960 CSS px）布局下，唤出「会话区/会话列表」的入口过多且行为不一致：

| 入口 | 现行为 |
|---|---|
| 布局开关「分栏」段 | 切到分栏 |
| 布局开关「聊天」段 | 切到聊天 |
| 文件头「显示聊天/隐藏聊天」按钮 | `toggleChatPane`，与布局开关完全重复 |
| 右缘竖条 chat rail | `toggleChatPane`，带未读角标 |
| Header「+」（SessionCreateButton） | 新建会话但**不**唤出聊天窗格（宽屏 `switchTab('chat')` 直接 return，会话建在背后） |
| Header「会话侧栏」按钮（SessionSidebarToggle） | 先展开聊天窗格再开侧栏 → 左栏布局下出现「左窗格 + 窄聊天列 + 侧栏」的怪状态 |
| Ctrl+K / 输入条「会话」按钮 | 开悬浮会话抽屉（SessionDrawer），与固定侧栏形成同一份列表两套皮 |

根因：**会话侧栏（SessionSidebar）寄生在聊天窗格（`.col-right`）内部**。聊天窗格在左栏布局下 `display:none`，所以想显示侧栏就必须先展开聊天窗格；左窗格还占着宽度，聊天列就被挤成窄条。

用户决定（对话中确认）：

1. 侧栏按钮点击后**只出会话列表，不出聊天页**——解耦。
2. 入口收窄：移除文件头「显示聊天」按钮；宽屏会话列表只保留侧栏一种形态（Ctrl+K / 输入条按钮改开侧栏）；**移除右缘竖条**（用户明知丢未读提示面仍选择移除）；修复 Header「+」不显示问题。

## 目标

- 会话侧栏成为独立列：左栏 / 分栏 / 聊天三种宽屏布局下都能开合，打开 = 只出列表，聊天窗格不动。
- 从列表点选会话 → 聊天窗格自动展开（保持分栏，不丢左栏上下文）。
- 宽屏下同一份会话列表只有侧栏一种形态；悬浮抽屉只服务窄屏与「选智能体」弹层。
- 左栏布局下唤出聊天窗格的入口收敛为三个，语义互不重叠：布局开关（切布局）、Header「+」（新建即见）、侧栏点选（看某个会话）。
- Header「+」在任何宽屏布局下创建会话后聊天窗格可见。

## 非目标

- 窄屏（手机）的抽屉交互不动。
- 抽屉组件本身保留（窄屏列表 + 智能体选择器/建群弹层两用）。
- 分栏比例记忆、布局开关自身、`useWideScreenLayout` 的互斥守卫不动。
- 不新增「会话」左栏页签（讨论过，属更大重构，用户未选）。

## 反目标（出现即失败）

- 任何布局下再出现「窄聊天缝」。
- 宽屏下会话列表重新出现第二种形态。

## 约束

- 遵守 `docs/spec/client/design-guide.md`：几何尺寸 `calc(N * var(--dp))`、CSS 与 JS 同现的数字 JS 侧乘 `uiScale`、36 主题对比度混合配方。
- 日志用 `appLog.*`；每个行为改动带单元测试；跨组件流程改动补 Playwright spec（chromium-coverage 即可，本地只跑新增 spec）。
- 本仓库为下游分叉：进入 `local` 分支的提交须登记 `docs/dev/local_changes.md`（本设计文档与实现提交都要登记）。

## 方案取舍

- **A. 解耦（选定）**：侧栏上移为 `content-area` 层的独立列，可见性与聊天窗格正交。直接移除根因；三种布局行为一致；改动面中等（App.vue 模板/CSS、toggle 逻辑、选会话 reveal、入口重排）。
- **B. 换宿主（否决）**：左栏下点侧栏按钮 → 先切「聊天」布局再开侧栏。改动极小，但把用户强行带离左栏文件页，回左栏要多点一次；且侧栏仍寄生，「窄缝」在其他路径仍可能出现。
- **C. 删除全局入口（否决）**：侧栏按钮整个移除，列表只能从聊天窗格内进。入口最少，但丢失「从任意布局直接看列表」的能力，与该按钮当初的设计意图（头部全局入口）相悖。

## 决定（已定的 how）

### 1. DOM 与 CSS：侧栏成为 `content-area` 的第二个 flex 子项

- `<SessionSidebar>` 从 `.col-right` 内（`App.vue` ~L383）上移到 `.content-area` 层，成为 `SplitView` 的兄弟节点。
- 宽屏规则：`.main-content.wide-screen .content-area { flex-direction: row }`（现 `css/layout.css` 为 column；窄屏不受影响，因为侧栏只在宽屏 `v-show`）。`SplitView` 根补 `flex: 1; min-width: 0`；侧栏 `flex-shrink: 0`，宽度仍由自身 220–480px 拖拽逻辑控制（`useSessionSidebar.setWidth` + `SplitDivider`，不改）。
- `v-show="sessionSidebar.open.value && isWideScreen"` 原样保留（v-show 而非 v-if：保持列表状态，组件注释有此要求）。
- 分栏布局下侧栏不再从右窗格内部划走宽度：聊天列宽从 `ratio·W − sidebar` 变为 `ratio·(W − sidebar)`，视觉位置不变（仍在最右），可接受。

### 2. 可见性模型：open 与布局正交（VS Code 面板模型）

- `useSessionSidebar` 的持久化（panel state `sessionSidebar`：open/width）不变；open 状态跨三种宽屏布局生效，不做每布局记忆。
- `SessionSidebarToggle`：`sidebarVisible = open`（删掉 `&& !chatCollapsed`）；`onToggle` 删掉「先 `setChatCollapsed(false)` 再开」的分支，纯 toggle。tooltip/aria 文案不变。
- **pane 归属（builder check Q1，已定）**：侧栏上移后丢失 `.col-right` 的 `@pointerdown/@focusin="setActivePane('right')"` 副作用，Ctrl+K / Ctrl+←→ / Ctrl+Delete 等 chat 快捷键会在点过侧栏后失效。保持现状语义：侧栏根元素补同样的 `@pointerdown/@focusin` → `setActivePane(PANE_RIGHT)`，并镜像 `onLeftPanePointerDown` 的失焦逻辑（把左栏焦点输入框 blur 出来，CodeMirror `.cm-content` 例外同款）。

### 2a. Ctrl+K 在侧栏已开时的行为（builder check Q3，已定）

纯 `openSidebar()` 对已打开的固定侧栏是静默无操作，快捷键会读起来像坏了。约定：`SessionSidebar` 经 `defineExpose` 提供 `revealCurrent()`——把当前会话行滚动进可视区并聚焦列表滚动容器（`tabindex="-1"`）；override 闭包改为 `open ? revealCurrent() : openSidebar()`。窄屏抽屉路径不变。

### 3. 从列表点选会话 → 展开聊天窗格

- `handleSessionSelect`（App.vue）开头、在 already-active 守卫**之前**加：`if (isWideScreen && chatCollapsed) { setChatCollapsed(false); setActivePane(PANE_RIGHT) }`（保持分栏，不收左栏；复用 `setOpenSessionHandler` L2588 的既有句式）。
- already-active 的会话也执行 reveal（选行 = 「给我看这段对话」），只是跳过 reload——现有守卫的职责是防消息列表重载，不是防显示。

### 4. 入口重排

- **移除**文件头「显示聊天/隐藏聊天」按钮：`FileHeader.vue` L61-74 按钮 + `toggleMaximizePane` emit 链（FileHeader → FileOverlay → FileViewer → App.vue 监听）+ App.vue `toggleChatPane` 函数（两个调用方都删了）。
- **移除**右缘竖条：模板 L404-423、`.chat-rail*` 全部 CSS（L5388-5463）、`has-chat-rail` class 绑定与 `.content-area.has-chat-rail` padding 规则。
- **宽屏 Ctrl+K / 输入条「会话」按钮改开侧栏**：App.vue L1871 的 `registerOpenSessionTabOverride` 闭包改为按 `isWideScreen` 分流——宽屏 `sessionSidebar.openSidebar()`，窄屏 `sessionIdentity.sessionDrawer.open()`。`ChatInputBar` 的 emit 与 `ChatPanelContent` 的 `handleOpenSessionList` 不动（改的只是 override 一处）。
- **抽屉「固定到侧栏」按钮删除**：`components/session/SessionDrawer.vue` L37 按钮 + `@pin` 链 + App.vue `handleDrawerPin`。随之清理 `useSessionSidebar` 的 `pinToSidebar` / `unpinToDrawer` / `openSessionTabBridge` / `registerOpenDrawer`（后者唯一消费者就是被改写的 bridge）与 `session.pinToSidebar`/`session.unpinToSidebar` i18n key（删前 grep 确认无残余引用）。
- **Header「+」修复**：`SessionCreateButton.goToChat` 改为——宽屏：`if (chatCollapsed) setChatCollapsed(false)` + `setActivePane(PANE_RIGHT)`；窄屏维持 `switchTab('chat')`。理由：组件注释明言「创建会话是 chat 动作，不能落在背后」，现状是被宽屏早退破坏的意图。

### 5. 我替你拍板的决定（可否决）

- **Header 侧栏按钮加未读角标**：竖条移除后，侧栏关着且聊天窗格隐藏时没有任何未读提示面。在 `SessionSidebarToggle` 上用 `store.state.chatUnreadCount` 显示小角标，样式复用 `.count-badge`。
  - **显隐条件（builder check Q2，已定）**：`open === false && chatCollapsed` —— 即忠实顶替竖条（竖条只在聊天隐藏时存在）。聊天窗格可见时未读就地可见，按钮上再挂角标是冗余噪音；这刻意**不是**新增的全局未读指示器。

### 6. 既有 e2e 基建的迁移（builder check Q4，已定为本次范围内）

以下文件依赖被移除的竖条/旧契约，不迁移则 CI 必红：

- `e2e/pages/navigation.page.ts` `switchToChat()` 宽屏分支 = 点竖条 → 改为点布局开关「分栏」段（为此给 `HeaderLayoutSwitch` 三个段补 `data-action="layout-left|layout-split|layout-chat"` 稳定钩子，符合仓库 e2e 钩子约定）。
- `e2e/specs/chat-scroll-memory.spec.ts`、`chat-scroll-streaming.spec.ts` 的 `[data-action="show-chat"]` → 同上走 page object 的统一 helper。
- `e2e/specs/session-sidebar-toggle.spec.ts` 注释记录的旧契约（「chat-collapsed → toggle 先展开窗格再开侧栏」）已被本设计删除 → 改写为新契约（toggle 不触碰聊天窗格）。

## 留给实现者的部分

- `chatPaneCollapseAffordance.test.ts`（现状是 rail + 文件头按钮的 source 守卫）改写为守护**新状态**的守卫测试：断言 `chat-rail`/`has-chat-rail`/`toggle-maximize-pane` 已不存在、侧栏挂在 `content-area` 层。
- i18n key 清理的精确范围（`unpinToSidebar` 疑似仅 keys 测试引用，删前 grep）。
- e2e spec 的步骤编排与断言粒度。
- SessionSidebar 在新位置的具体 CSS 落点（根元素已是 `width + SplitDivider` 的自包含列，理论上只需容器规则）。

## 测试计划

单元（`*.test.ts` 就近）：

- `SessionSidebarToggle.test.ts`：visible 只看 open；toggle 不再触碰 `chatCollapsed`；未读角标显隐（打开时不显示）。
- `useSessionSidebar.test.ts`：删除 `pinToSidebar`/`openSessionTabBridge` 用例（API 移除）。
- `useSessionIdentity.test.ts`：`openSessionTab` override 宽屏 → 侧栏、窄屏 → 抽屉。
- `FileHeader.test.ts`：移除 toggle-maximize 按钮断言。
- `sessionHeaderKeys.test.ts`：keys 列表去掉 pin/unpin。
- 新守卫测试（替代 chatPaneCollapseAffordance 的职责）。

E2E（`e2e/specs/session_sidebar_decouple.spec.ts`，chromium-coverage 单跑）：

1. 左栏布局 → 点 header 侧栏按钮 → 断言列表可见、聊天窗格不可见（无窄缝）。
2. 点选列表某会话 → 聊天窗格出现、仍为分栏、会话已切换。
3. 再点 header 按钮 → 侧栏收起。
4. Ctrl+K → 侧栏打开（不是抽屉）；侧栏已开时 Ctrl+K → 当前行滚入可视区（断言 `revealCurrent` 生效，如当前行 class 带 focus/scroll 位置）。
5. 既有 spec 迁移（见 §6）：navigation page object、chat-scroll 两例、session-sidebar-toggle 契约改写。

## 验收标准

- 左栏布局下点 header 侧栏按钮：只见列表 + 左窗格，中间无聊天列。
- 三种布局下侧栏开合一致；侧栏开着切布局，侧栏保持。
- 点列表行：聊天窗格展开（分栏），会话切换；已激活会话也展开但不重载。
- 宽屏下找不到：文件头显示聊天按钮、右缘竖条、抽屉固定按钮；Ctrl+K/输入条按钮开的是侧栏。
- Header「+」在左栏下创建后聊天窗格立即出现。
- `npm test`、`npm run build` 通过；`./scripts/pre-push-checks.sh` 推送前通过。
