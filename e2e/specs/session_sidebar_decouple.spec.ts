import { test, expect } from '../fixtures'

/**
 * 会话侧栏解耦（docs/superpowers/specs/2026-11-11-session-sidebar-decouple-design.md）。
 *
 * 五条真实浏览器才能证明的契约：
 *
 *  1. 左栏布局下点 header 侧栏按钮：只出列表不出聊天窗格——「窄聊天缝」
 *     是本次设计的头号反目标，jsdom 无布局，只有真实引擎能证明它不存在。
 *  2. 从列表点选会话：聊天窗格自动展开（保持分栏），会话完成切换。
 *  3. toggle 再点一次：侧栏收起。
 *  4. Ctrl+K：宽屏开侧栏（不是悬浮抽屉）；已开时滚当前行进可视区。
 *  5. 侧栏开着切换布局：列表全程保持（可见性与布局正交）。
 *
 * 布局开关的稳定钩子（[data-action="layout-*"]）由解耦设计 §6 引入。
 */
test.describe('Session sidebar decouple', () => {
  test('left-pane layout: the toggle shows the list WITHOUT the chat pane', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const toggle = page.locator('[data-action="toggle-session-sidebar"]')
    const sidebar = page.locator('.session-sidebar')
    const textarea = page.locator('.chat-textarea')

    // 先收侧栏、再切左栏，从「侧栏关 + 聊天隐藏」这个纯左栏状态开始。
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(sidebar).not.toBeVisible()
    await page.locator('[data-action="layout-left"]').click()
    await expect(textarea).not.toBeVisible()

    await toggle.click()
    await expect(sidebar).toBeVisible()
    // 反目标红线：列表在场，聊天窗格必须不在场（无窄缝）。
    await expect(textarea).not.toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  test('selecting a session from the list reveals the chat pane in split', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const toggle = page.locator('[data-action="toggle-session-sidebar"]')
    const sidebar = page.locator('.session-sidebar')
    const textarea = page.locator('.chat-textarea')

    // 进入「左栏 + 侧栏开」状态。
    await page.locator('[data-action="layout-left"]').click()
    await expect(textarea).not.toBeVisible()
    await expect(sidebar).toBeVisible()

    // 点选一个非当前会话行；没有第二个会话时先建一个。
    const rows = sidebar.locator('.session-item')
    await expect(rows.first()).toBeVisible()
    if (await rows.count() < 2) {
      await page.locator('[data-action="create-session"]').click()
      await expect(textarea).toBeVisible({ timeout: 15000 })
      // 创建路径已经 reveal；重新进入左栏继续测点选路径。
      await page.locator('[data-action="layout-left"]').click()
      await expect(textarea).not.toBeVisible()
    }
    // 列表按最近更新排序，最后一行几乎必然不是当前会话；只有单会话时
    // 它就是 active 行——点选已激活会话同样要 reveal（不重载）。
    await rows.last().click()

    await expect(textarea).toBeVisible({ timeout: 15000 })
    // 保持分栏：布局开关的分栏段处于 active（aria-pressed）。
    await expect(page.locator('[data-action="layout-split"]')).toHaveAttribute('aria-pressed', 'true')
    // 会话切换完成：标题骨架退场。
    await expect(page.locator('.chat-title-skeleton-title')).toHaveCount(0, { timeout: 15000 })
  })

  test('Ctrl+K opens the sidebar, and re-focuses the current row when already open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const toggle = page.locator('[data-action="toggle-session-sidebar"]')
    const sidebar = page.locator('.session-sidebar')

    // 侧栏收起；点聊天区的消息面（非输入框——Ctrl+K 处理器忽略来自
    // INPUT/TEXTAREA 的按键，防打字误触）使 activePane=right 以过门控。
    if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click()
    await expect(sidebar).not.toBeVisible()
    await page.locator('.chat-messages').click()

    await page.keyboard.press('Control+k')
    await expect(sidebar).toBeVisible()

    // 已开时再按：当前行滚入可视区（revealCurrent）。滚动容器被聚焦
    // （tabindex="-1" 只钉在项目 pane 上，跨项目 pane 无此属性，可唯一定位）。
    await page.keyboard.press('Control+k')
    await expect(sidebar.locator('.session-list-pane[tabindex="-1"]')).toBeFocused()
    const active = sidebar.locator('.session-item.active')
    if (await active.count()) await expect(active.first()).toBeInViewport()
  })

  test('the sidebar survives layout switches while open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const sidebar = page.locator('.session-sidebar')
    const textarea = page.locator('.chat-textarea')

    // 新 profile 默认开侧栏（分栏）；切左栏 → 侧栏保持，聊天隐藏。
    await expect(sidebar).toBeVisible()
    await page.locator('[data-action="layout-left"]').click()
    await expect(textarea).not.toBeVisible()
    await expect(sidebar).toBeVisible()

    // 切聊天（左栏收起、聊天独占）→ 侧栏仍在，聊天可见。
    await page.locator('[data-action="layout-chat"]').click()
    await expect(textarea).toBeVisible()
    await expect(sidebar).toBeVisible()

    // 回分栏 → 全都在。
    await page.locator('[data-action="layout-split"]').click()
    await expect(textarea).toBeVisible()
    await expect(sidebar).toBeVisible()
  })
})
