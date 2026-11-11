# 本地改动台账（相对上游）

本仓库是上游 [clawbench-dev/clawbench](https://github.com/clawbench-dev/clawbench) 的下游分叉。本文档记录 `local` 分支相对上游 `main` 的**全部本地改动**：改了什么、为什么改、上游演进后是否需要跟进维护。git 只记录 what，这里补上 why 与维护口径。

## 分叉模型

| 分支 | 指向 | 规则 |
| --- | --- | --- |
| `main` | 恒等于 `upstream/main` | 只作上游跟踪分支，**不落任何本地提交** |
| `local` | `main` + 本地提交 | 所有本地改动只进这条分支（推送到 `origin/local`） |
| `upstream` remote | `clawbench-dev/clawbench` | 同步来源 |

判定「这是不是我们的改动」只需两条命令：

```bash
git log main..local          # 本地提交清单（台账的 commit 维度）
git diff main...local        # 相对上游的完整补丁（台账的文件维度）
```

## 当前基线快照

| 字段 | 当前值 |
| --- | --- |
| 台账基准（merge-base） | `412c16a7`（上游 `main`，2026-11-11） |
| 本地领先 | 9 个提交，6 个主题，61 个文件（+3225 / −1023） |
| 本地落后 | 0（当日已同步） |
| 工作区未提交改动 | 0（2026-11-11 全部提交；个人杂物不纳管：`.zcode/`、`public/`、`il2cppdumper.zip`、截图 jpg） |

## 同步上游流程

```bash
git fetch upstream
git checkout local
git merge upstream/main      # local 已推送远端，用 merge 而非 rebase
```

冲突几乎必然落在下表「涉及文件」里。逐冲突区对照该行「上游演进时的维护口径」判断：保留本地补丁、采用上游实现、还是两者融合。同步完成后更新「当前基线快照」，若某主题因上游原生实现了同等能力而退役，把它移入「已退役」节并注明退役提交。

## 改动台账

### 1. 本地构建禁走应用内自升级

| 字段 | 内容 |
| --- | --- |
| 提交 | `d6ed72f0`（禁止自升级替换为官方 npm 包）、`0c3a3109`（升级检查对本地构建恒报无升级 + 版本徽章不再双 v） |
| 涉及文件 | `internal/handler/upgrade.go`、`internal/service/upgrade.go`、`internal/handler/upgrade_local_build_test.go`、`internal/service/upgrade_local_build_test.go`、`web/src/components/UpgradePromptOverlay.vue`（+ 测试） |
| 改动 | 本地源码构建的进程不做应用内自升级替换；升级检查端点对本地构建恒报「无升级」；前端升级提示徽章不再双 `v` |
| 为什么 | 本地构建不是官方分发渠道，自升级会用官方 npm 包**覆盖掉本地构建**，本地改动随之丢失 |
| 部署纪律 | **手工部署的二进制必须带版本戳**：`go build -ldflags "-X 'clawbench/internal/version.Version=$(git describe --tags --always)-$(date +%m%d%H%M)'"`（与 build.sh 同源）。裸 `go build` 产出的未打戳版本会被守卫**刻意**当作「继续查 registry 的构建」处理（为上游测试保真，见 `internal/service/upgrade.go` fetchUpgradeInfo 的门控注释），于是弹「有新版本」提示且点升级被 403——2026-11-11 实际踩过（部署 `-h` 时裸构建触发升级提示，`-i` 重打戳修复） |
| 上游演进时 | 冲突高发区（upgrade 链路）。若上游将来提供「构建来源识别」或本地分发渠道，可评估退役；退役前每次上游改动 `upgrade.go` 都需重新套用本地守卫 |

### 2. 引用栏回车改为「加入」

| 字段 | 内容 |
| --- | --- |
| 提交 | `024b251f` |
| 涉及文件 | `web/src/components/common/QuoteQuestionBar.vue`（+ 测试）、`docs/user-guide/chat.md` |
| 改动 | 引用栏输入框回车行为从「直接发送并启动对话」改为「加入引用」，不再直接发出去 |
| 为什么 | 交互偏好：回车误触直接发送的代价高于多点一次 |
| 上游演进时 | 单组件小改动。若上游重构 `QuoteQuestionBar` 或原生提供该行为开关，可直接退役 |

### 3. 布局切换移到顶栏三态分段控件

| 字段 | 内容 |
| --- | --- |
| 提交 | `88e3a252`（三态分段控件 + 快捷键滚动提示换固定按钮）、`28372693`（审查修复：左栏→聊天死点击、漏跑的红测试、陈旧注释） |
| 涉及文件 | `web/src/App.vue`、`web/css/layout.css`、`web/src/components/common/AppHeader.vue`、`HeaderLayoutSwitch.vue`（新增）、`ShortcutTipTicker.vue`（删除，含测试）、`web/src/i18n/locales/{zh,en}.ts`（+ 测试） |
| 改动 | 顶栏新增「左栏 / 分栏 / 聊天」三态分段控件直达切换（替代悬停才显现、易误触的 SplitView 折叠手柄）；删 `ShortcutTipTicker` 滚动提示区，换固定 Keyboard 图标按钮开同一对话框（`headerShortcutTips` 设置语义改为控制该按钮） |
| 为什么 | 交互偏好：布局切换常显、无悬停依赖；分栏手柄紧贴左栏滚动条，奔滚动条去时经常误触发 |
| 上游演进时 | 涉及面最广的主题（App.vue / layout.css / AppHeader / i18n 四处都可能冲突）。上游若改分栏布局或顶栏结构，需把分段控件的挂载点与 `activePane` 路由语义重新对齐 |

### 4. 分叉声明与改动台账（文档化）

| 字段 | 内容 |
| --- | --- |
| 提交 | 本提交（`docs(local): 分叉声明与改动台账登记`；无 hash 可自引用） |
| 涉及文件 | `README.md`、`README.en.md`、`AGENTS.md`、`docs/dev/local_changes.md`（新增） |
| 改动 | 中英 README 各加「下游分叉」声明段，许可证署名改为「上游 + 本分叉」双行；`AGENTS.md` 开发规则新增「每个 `local` 提交必须登记台账」；新建本台账文档 |
| 为什么 | 计划将本分叉公开开源，需向上游致谢并披露差异；同时给本地改动一个持续维护入口 |
| 上游演进时 | README 的分叉声明段是本地插入块，上游改动同区域时需保留；许可证段是双行署名，合并时两行都要留。其余无维护成本 |

### 5. 会话侧栏与顶栏会话入口的系统级化改造

| 字段 | 内容 |
| --- | --- |
| 提交 | `bcfafd02`（+ 号交互对调另含本次 `v-long-press` 触屏长按修复，与 ChatInputBar 同提交） |
| 涉及文件 | `web/src/components/session/`：`SessionListHeader.vue`（纯图标 + 布局重构 + compact）、`SessionList.vue`（去模型徽章）、`SessionSidebar.vue`、`SessionDrawer.vue`、`SessionSidebarToggle.vue`（新增）、`SessionCreateButton.vue`（新增，均含测试）；`web/src/components/common/AppHeader.vue`（`.header-right-cluster` 容器）；`web/src/components/chat/ChatInputBar.vue`（+ 号长短按对调）；`web/src/composables/useSettingsConfig.ts` + `web/src/components/settings/settingsFieldMap.ts`（layoutMemory 默认 `project`）；`web/src/i18n/locales/{zh,en}.ts`；`e2e/specs/session-sidebar-toggle.spec.ts`（新增）、`e2e/pages/chat.page.ts`；`docs/user-guide/{chat,getting-started,session}.md`、`docs/spec/features/usage-meter.md` |
| 改动 | ①会话侧栏头部按钮纯图标化并去掉 ActionBar 的 `min-width: min-content` 地板（修拖窄时「刷新/关闭」被裁的 bug），窄于 280px 走 compact 形态（隐藏标题文字）；②顶栏右侧图标簇新增会话侧栏开关与「+ 新建会话」按钮（短按建默认智能体会话、长按/右键选智能体），布局三态分段控件移入右侧簇；③右侧控件收进 `.header-right-cluster` 恒渲染容器（全 header 唯一 `margin-left:auto`），退役「胶囊撑 auto / 主题按钮兜底 / `header--has-meter`」链；④聊天页 + 号交互对调（短按=直接建会话，长按=选择器，i18n 键随之改名）；⑤会话行去掉模型徽章、时间 `flex-shrink:0`；⑥布局记忆默认 `global`→`project` |
| 为什么 | 交互偏好：会话管理提升到系统级（对齐 Cursor 类工具）；新建会话高频路径不该每次过选择器；模型信息对选会话无用且挤占时间；不同项目的分栏布局本就不同，按项目记忆更符合直觉。①的裁剪 bug 是上游 ActionBar 契约与侧栏头部 `min-content` 地板相互作用所致 |
| 上游演进时 | 高冲突主题：AppHeader 右簇结构与 `usageMeterWiring` / `headerClusterSpacing` 两个 wiring 测试强耦合（上游若改顶栏间距链需重对齐容器契约）；`SessionListHeader` 的 compact prop 与 ActionBar 折叠兜底是本地契约；ChatInputBar 对调与上游「防误触强制选择器」设计意图相反，上游重构创建流程时需重套用；layoutMemory 默认翻转、模型徽章移除均为行为偏好，上游无对应开关 |

### 6. 内联媒体三区尺寸策略与窗口预算按表面分流

| 字段 | 内容 |
| --- | --- |
| 提交 | `82628a40` |
| 涉及文件 | `web/css/media-block.css`、`web/css/markdown-common.css`、`web/src/utils/svgMediaFit.ts`、`inlineZoom.ts`、`mermaid.ts`（+ 三个测试文件）、`e2e/specs/mermaid-diagram-sizing.spec.ts`（新增）、`docs/spec/client/frontend-architecture.md` |
| 改动 | SVG 矢量媒体按三区渲染：适中图完整、竖长图铺满栏宽进 `.svg-scroll` 框内滚动窗口（内容格可裁图、图绝不被高度钳制）、两端有界（小图封顶 2×uiScale×自然宽、超长限 5 个窗口内容高）；高度预算收敛为 `--media-window`（文档面 75dvh、聊天覆写 60dvh），JS `mediaHeightFrac()` 按同一 hook 取值并由测试配对钉住；打标前离屏探测扣除滚动条宽度 |
| 为什么 | 上游策略下竖长 mermaid 缩到标签不可读、小图反被放大铺满整栏；平板反馈文档面 60dvh「太矮」而全局 75dvh 曾因手机聊天放不下回退——按表面分流是唯一能同时满足两者的方案 |
| 上游演进时 | `media-block.css` 的 `--media-window`/`.svg-scroll` 与 `svgMediaFit.ts` 的 `mediaHeightFrac()`/`scrollbarAllowance()` 是本地配对契约（上游单侧改动即失配，测试会拦）；上游若原生实现滚动窗口或表面分流可退役 |

### 7. 会话侧栏解耦与宽屏会话入口收窄

| 字段 | 内容 |
| --- | --- |
| 提交 | `ead9a256`…`8376325`（feat ×4 + refactor + test(e2e)，详见 `git log`） |
| 涉及文件 | `web/src/App.vue`（SessionSidebar 挂载点/content-area、handleSessionSelect reveal、override 分流、删 rail/toggleChatPane/has-chat-rail）、`web/css/wide-screen.css`（flex 兄弟列规则）、`web/src/components/session/`：`SessionSidebarToggle.vue`（纯 toggle + 未读角标）、`SessionCreateButton.vue`（goToChat 宽屏 reveal）、`SessionList.vue`（`revealActive()` + 滚动容器 tabindex）、`SessionSidebar.vue`（`revealCurrent()` expose）、`SessionDrawer.vue`（删 pin）、`web/src/components/file/{FileHeader,FileOverlay,FileViewer}.vue`（删聊天开关 emit 链）、`web/src/components/common/HeaderLayoutSwitch.vue`（`data-action="layout-*"` 钩子）、`web/src/composables/useSessionSidebar.ts`（删 pinToSidebar/unpinToDrawer/openSessionTabBridge/registerOpenDrawer）、`web/src/i18n/locales/{zh,en}.ts`（删 session.pinToSidebar/unpinToSidebar、nav.showChat/hideChat、actionLabels.showChat/hideChat）；测试：`sessionSidebarDecouple.test.ts`（新增守卫）、`SessionSidebarToggle/SessionCreateButton/SessionDrawer/useSessionSidebar/sessionHeaderKeys/FileHeader` 各测试更新、删 `chatPaneCollapseAffordance.test.ts`；e2e：`session_sidebar_decouple.spec.ts`（新增）、`navigation.page.ts`/`chat-scroll-memory`/`chat-scroll-streaming`/`session-sidebar-toggle` 迁移；设计文档与计划在 `docs/superpowers/{specs,plans}/2026-11-11-session-sidebar-decouple*.md` |
| 改动 | ①会话侧栏从聊天窗格（`.col-right`）上移为 `.content-area` 层的独立 flex 列，open 状态与三种宽屏布局正交（左栏/分栏/聊天都能开合，打开=只出列表）；②点选会话/新建会话自动 reveal 聊天窗格（保持分栏，已激活会话也 reveal 但不重载）；③header 侧栏开关纯 toggle 化并在「侧栏关 + 聊天隐藏」时显示未读角标（顶替被删竖条的唯一未读面）；④宽屏 Ctrl+K 与聊天输入条「会话」按钮改开固定侧栏（已开则 `revealCurrent()` 滚动聚焦当前行），悬浮抽屉只留给窄屏与智能体选择器；⑤移除右缘竖条 chat rail、文件头「显示/隐藏聊天」按钮、抽屉「固定到侧栏」按钮及 `useSessionSidebar` 四个冗余 API；⑥布局开关补 `data-action="layout-left|split|chat"` 稳定钩子 |
| 为什么 | 左栏布局下唤出会话区/列表的入口多达 5 个且行为不一；根因是侧栏寄生在聊天窗格内——显示列表必须先展开聊天窗格，左栏布局下产生「左窗格 + 窄聊天列 + 侧栏」的窄缝怪状态。解耦后入口收敛为三个语义不重叠的路径：布局开关（切布局）、Header「+」（新建即见）、侧栏点选（看某个会话） |
| 上游演进时 | ①`<SessionSidebar>` 的挂载点（`</SplitView>` 之后、`</main>` 之前）与 `wide-screen.css` 的 `> .split-view`/`> .session-sidebar` flex 规则是一对：上游重排 App.vue 模板需按相同语义搬运挂载点；②`handleSessionSelect` 的 reveal 必须保持在跨项目分支与 already-active 守卫**之前**（守卫测试钉了行序）；③override 分流（`registerOpenSessionTabOverride` 闭包）是宽屏侧栏/窄屏抽屉的唯一分叉点；④HeaderLayoutSwitch 的 `data-action` 钩子与 e2e page object 强耦合；⑤上游若复刻 rail/文件头按钮，对照设计文档裁决而非照搬 |

## 已退役

（暂无。主题因上游原生实现同等能力而不再需要时，从上表移入本节，注明退役提交与日期。）

## 维护规则

1. **每个进入 `local` 的新提交都必须在本表登记**：提交信息已带 `local:` 前缀的，同一主题追加进对应行；新主题建新节。
2. 冲突解决后若本地补丁内容发生变化，更新该主题的「涉及文件」与「改动」描述。
3. 上游实现了同等能力 → 退役并移入「已退役」；本地补丁已融入上游 → 同样退役。
4. 每次同步上游后刷新「当前基线快照」。
