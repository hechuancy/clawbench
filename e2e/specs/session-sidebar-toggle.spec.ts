import { test, expect } from '../fixtures'

/**
 * The pinned session sidebar and its header-wide entry points.
 *
 * Three regressions are guarded here, the first two invisible to jsdom:
 *
 *  1. The AppHeader toggle ([data-action="toggle-session-sidebar"]) must open
 *     and close the pinned sidebar from any layout state — session management
 *     used to be reachable only from inside the chat pane. After the decoupling
 *     it is ALSO the only session-list form on wide screens: the toggle flips
 *     the sidebar and never touches the pane layout.
 *  2. Dragging the sidebar to its minimum width must keep every header action
 *     button fully painted inside the header. The old header floored the
 *     action row at its labeled width (min-content), so the ActionBar never
 *     shrank or folded, and the trailing buttons were clipped off the header's
 *     right edge ("刷…" in the bug report). jsdom cannot catch layout
 *     clipping — this reads real bounding boxes back.
 *  3. The header quick-create button ([data-action="create-session"]) must
 *     create a session with the default agent straight from the header (tap —
 *     the picker moved to long press), a real backend flow jsdom cannot cover.
 *
 * The toggle-never-expands-chat contract is covered by SessionSidebarToggle.test.ts
 * against the real layout singletons, and end-to-end by the 左栏 scenario below.
 */
test.describe('Session sidebar: header toggle + narrow-width header integrity', () => {

  test('header toggle opens and closes the pinned sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const toggle = page.locator('[data-action="toggle-session-sidebar"]')
    const sidebar = page.locator('.session-sidebar')
    const textarea = page.locator('.chat-textarea')

    await expect(toggle).toBeVisible()
    // A fresh profile persists no state, and the panel-state default is open.
    await expect(sidebar).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()
    await expect(sidebar).not.toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await toggle.click()
    await expect(sidebar).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    // 左栏布局（聊天窗格隐藏）：toggle 只翻侧栏开合，聊天窗格保持隐藏——
    // 解耦后的核心契约，绝不出现「列表 + 窄聊天缝」。
    await page.locator('[data-action="layout-left"]').click()
    await expect(textarea).not.toBeVisible()
    await expect(sidebar).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()
    await expect(sidebar).not.toBeVisible()
    await toggle.click()
    await expect(sidebar).toBeVisible()
    await expect(textarea).not.toBeVisible()

    // 回到分栏，聊天窗格回来。
    await page.locator('[data-action="layout-split"]').click()
    await expect(textarea).toBeVisible()
  })

  test('header action buttons stay inside the header at the minimum sidebar width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const sidebar = page.locator('.session-sidebar')
    await expect(sidebar).toBeVisible()

    // Drag the sidebar's SplitDivider toward the sidebar's right edge — that
    // boundary IS the sidebar's width (width = right edge − pointer x) — until
    // the clamp floors it at SIDEBAR_MIN_WIDTH (220px).
    const divider = sidebar.locator('.split-view__divider')
    const dividerBox = await divider.boundingBox()
    expect(dividerBox, 'the sidebar must render its resize divider').toBeTruthy()
    await page.mouse.move(dividerBox!.x + dividerBox!.width / 2, dividerBox!.y + dividerBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(dividerBox!.x + 400, dividerBox!.y + dividerBox!.height / 2, { steps: 12 })
    await page.mouse.up()

    // Width settled at the clamp (±1px rounding).
    await expect.poll(
      () => sidebar.evaluate(el => el.getBoundingClientRect().width),
      { timeout: 5000 },
    ).toBeLessThanOrEqual(221)

    // The reported bug: the trailing buttons (refresh, close) were clipped off
    // the header's right edge while their labels were still shown. Every
    // button that is rendered must be fully inside the header box. (A button
    // hidden by the ActionBar's fold-to-menu reports a null box — that is
    // graceful degradation, not clipping, and at the minimum width the
    // icon-only row should fit without folding anyway.)
    const header = sidebar.locator('.session-sidebar-header')
    const headerBox = await header.boundingBox()
    expect(headerBox, 'the sidebar header must be laid out').toBeTruthy()
    const headerRight = headerBox!.x + headerBox!.width
    for (const action of ['search', 'create', 'refresh', 'close']) {
      const btn = header.locator(`.header-action-btn[data-action="${action}"]`)
      await expect(btn).toBeAttached()
      const box = await btn.boundingBox()
      if (!box || box.width === 0) continue // folded into the "more" menu
      expect(box.x, `${action} must not stick out of the header's left edge`).toBeGreaterThanOrEqual(headerBox!.x - 0.5)
      expect(box.x + box.width, `${action} must not be clipped off the header's right edge`).toBeLessThanOrEqual(headerRight + 0.5)
    }

    // The two buttons the bug actually lost must be visibly back.
    await expect(header.locator('.header-action-btn[data-action="refresh"]')).toBeVisible()
    await expect(header.locator('.header-action-btn[data-action="close"]')).toBeVisible()
  })

  test('header quick-create button starts a default-agent session from any tab', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const createBtn = page.locator('[data-action="create-session"]')
    await expect(createBtn).toBeVisible()

    // Count sessions in the sidebar before, click, expect the list to grow —
    // the new session is created server-side and patched into the list.
    const sidebar = page.locator('.session-sidebar')
    await expect(sidebar).toBeVisible()
    const countSessionRows = () => sidebar.locator('.session-item').count()
    const before = await countSessionRows()

    await createBtn.click()

    // A fresh untitled session becomes the active one: the chat title bar
    // stops showing the skeleton once the switch completes, and the sidebar
    // gains a row.
    await expect.poll(countSessionRows, { timeout: 15000 }).toBeGreaterThan(before)
    await expect(page.locator('.chat-title-skeleton-title')).toHaveCount(0, { timeout: 15000 })
    await expect(page.locator('.chat-title-bar .bs-header-title, .chat-title-bar .bs-header-description').first()).toBeVisible()
  })
})
