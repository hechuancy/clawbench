import { test, expect, type Page } from '../fixtures'
import { projectApiFetch } from '../helpers/auth'
import { FileManagerPage } from '../pages/file-manager.page'
import { NavigationPage } from '../pages/navigation.page'

/**
 * Mermaid diagrams follow the THREE-ZONE sizing policy of svgMediaFit.ts.
 *
 * The contract (svgMediaFit.ts + media-block.css), shaped by the reports on
 * #570 and a wide tablet where the column is ~2.7× the diagram's natural
 * width:
 *
 *   COMPLETE  fits whole (column × window) at ≥90% natural label size → whole,
 *             no scroll (squares, landscape, short portrait)
 *   FILL      too tall to fit whole readably →
 *             width = min(avail, 2 × natural × uiScale, 5 × window × ratio);
 *             height > window? → `.svg-scroll`, the CELL is a scroll window
 *   CONTROLS  too-small capped at 2× natural; too-elongated capped at 5
 *             scroll windows of content
 *
 * The window is the surface's `--media-window` budget: 75dvh on document
 * surfaces like this preview (chat overrides to 60dvh), pinned per surface by
 * the unit tests.
 *
 * The svg itself is never height-clamped (clamping it was the mechanism that
 * kept portrait flowcharts at ~7px text through two reverted attempts). This
 * needs REAL layout (jsdom cannot measure a rendered box or evaluate dvh), so
 * the assertions derive the EXPECTED width from the live column/viewport the
 * same way the module does and compare the rendered box against it.
 *
 * Chat shares the exact same figure pipeline and stylesheet (there is no
 * chat-specific size rule — pinned by MarkdownPreviewSvgFit.css.test.ts), so
 * this spec covers the contract for both surfaces.
 */

const MD_NAME = 'e2e-mermaid-sizing.md'

const TALL_FLOWCHART = `flowchart TD
    Q[问题 q + schema S] --> G[候选 SQL 生成 G=8 条]
    G --> V1[执行准确率 w=2]
    V1 --> V2[逻辑一致性 w=1]
    V2 --> V3[Schema linking w=1]
    V3 --> V4[N-gram 相似度 w=1]
    V4 --> V5[格式合规 w=1]
    V5 --> R[加权求和 R = 5 w_i r_i]
    R --> N[组内归一 优势 A_i = r_i - mean]
    N --> U[GRPO 更新 PPO-Clip + KL]
    U --> M[更新策略模型 进入下一轮]`

const SHORT_FLOWCHART = `flowchart TD
    A[输入] --> B[输出]`

const MD_CONTENT = `# Mermaid sizing e2e

## 竖版长流程图

\`\`\`mermaid
${TALL_FLOWCHART}
\`\`\`

## 短流程图

\`\`\`mermaid
${SHORT_FLOWCHART}
\`\`\`
`

async function writeProjectFile(name: string, content: string): Promise<void> {
    const resp = await projectApiFetch('/api/file/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: name, content }),
    })
    expect(resp.ok, `write ${name}`).toBe(true)
}

async function deleteProjectFile(name: string): Promise<void> {
    await projectApiFetch('/api/file/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: name }),
    })
}

/**
 * The app lists the browsed directory ONCE at startup (the store caches
 * `dirEntries` and switching to an already-active browse tab does not refetch),
 * so a file written after page load is invisible until an explicit reload.
 * The browse toolbar's refresh button (title-localized, unlike the neighboring
 * sort/new/upload buttons) runs `loadFiles` fresh — the same lever the
 * file-search spec relies on search freshness for.
 */
async function reloadListing(page: Page): Promise<void> {
    const refreshBtn = page.locator('.toolbar-btn[title="Refresh"]')
    await expect(refreshBtn).toBeVisible({ timeout: 10000 })
    await refreshBtn.click()
    // The reload is async; wait for the button's loading state to clear so the
    // following file locator never races the stale listing.
    await expect(refreshBtn).not.toHaveClass(/loading/, { timeout: 10000 }).catch(() => undefined)
}

test.describe('Mermaid diagram sizing in file preview', () => {
    let fm: FileManagerPage
    let nav: NavigationPage

    test.beforeEach(async ({ page }) => {
        await writeProjectFile(MD_NAME, MD_CONTENT)
        fm = new FileManagerPage(page)
        nav = new NavigationPage(page)
        await nav.switchToFileManager()
        await fm.waitForContent(15000)
        await reloadListing(page)
    })

    test.afterAll(async () => {
        await deleteProjectFile(MD_NAME)
    })

    async function openPreview(page: Page) {
        await fm.openFile(MD_NAME)
        const body = page.locator('.markdown-body[data-file-path]')
        await expect(body).toBeVisible({ timeout: 15000 })
        // Mermaid renders asynchronously (a lazy chunk plus layout); the svg
        // appearing is the completion signal for the first diagram.
        await expect(body.locator('.image-block-wrapper .mermaid svg').first())
            .toBeVisible({ timeout: 30000 })
        return body
    }

    /**
     * Re-derive `applyMediaWidth`'s expected width from the LIVE page — the
     * same three-zone policy the module applies (complete / fill+scroll / end
     * controls), computed from the column width, the artwork's natural size
     * and ratio, the UI scale, and the viewport height. The classic-scrollbar
     * allowance (platform-dependent, a few px in headless) is covered by a
     * tolerance instead of being re-probed.
     */
    async function expectFilled(page: Page, figure: import('@playwright/test').Locator) {
        const svg = figure.locator('.mermaid svg')
        await expect(svg).toBeVisible({ timeout: 30000 })
        const derive = () => figure.evaluate((fig) => {
            const svgEl = fig.querySelector('.mermaid svg') as SVGSVGElement
            const column = fig.parentElement!
            const cs = getComputedStyle(column)
            const ws = getComputedStyle(fig)
            const avail = column.clientWidth
                - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
                - (parseFloat(ws.borderLeftWidth) || 0) - (parseFloat(ws.borderRightWidth) || 0)
            const vb = svgEl.viewBox.baseVal
            const ar = vb.width > 0 && vb.height > 0 ? vb.width / vb.height : 0
            const scaleRaw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'))
            const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1
            const natural = (parseFloat(svgEl.style.maxWidth) || vb.width || 0) * scale
            // File preview is a document surface → the 75dvh window budget.
            const budget = window.innerHeight * 0.75
            const upscaleCap = 2 * natural
            const completeW = Math.min(avail, budget * ar, upscaleCap)
            const expected = completeW >= 0.9 * natural
                ? completeW
                : Math.min(avail, upscaleCap, 5 * budget * ar)
            const scrolls = expected / ar > budget
            return {
                expected,
                scrolls,
                stamped: parseFloat(svgEl.style.width) || 0,
                scrollHeight: (fig.querySelector('.mermaid') as HTMLElement).scrollHeight,
                clientHeight: (fig.querySelector('.mermaid') as HTMLElement).clientHeight,
            }
        })
        // Wait for layout to converge FIRST: the stamped width may re-fit once
        // while the overlay's panels settle (ResizeObserver passes), and the
        // pre-convergence snapshot would mismatch the post-convergence column.
        const pre = await derive()
        await expect.poll(async () => (await svg.boundingBox())?.width ?? 0, { timeout: 10000 })
            .toBeGreaterThanOrEqual(pre.expected - 20)
        const m = await derive()
        // Stamped width matches the derived fill width (a small tolerance for
        // the scrollbar allowance and rounding).
        expect(m.stamped).toBeLessThanOrEqual(m.expected + 2)
        expect(m.stamped).toBeGreaterThanOrEqual(m.expected - 20)
        expect(m.stamped).toBeGreaterThan(0)
        expect(m.scrolls, 'scroll stamp must match the derived decision')
            .toBe(m.scrollHeight > m.clientHeight)
        return m
    }

    test('fills the column with a tall diagram inside a scroll window', async ({ page }) => {
        const body = await openPreview(page)
        // The tall diagram is the FIRST figure in the document.
        const tallFigure = body.locator('.image-block-wrapper').first()
        const m = await expectFilled(page, tallFigure)

        await expect(tallFigure).toHaveClass(/svg-scroll/)
        expect(m.scrollHeight).toBeGreaterThan(m.clientHeight)
    })

    test('renders a small diagram COMPLETE at the upscale cap, no scroll window', async ({ page }) => {
        // A 2-node sketch fits whole (column × window) well before the column
        // ends, and the 2×-natural cap keeps its labels figure-sized — the
        // COMPLETE zone. The derived decision and the rendered one must agree.
        const body = await openPreview(page)
        const fitFigure = body.locator('.image-block-wrapper').nth(1)
        const m = await expectFilled(page, fitFigure)

        expect(m.stamped).toBeGreaterThan(0)
        expect(m.scrolls).toBe(false)
        expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight)
    })
})
