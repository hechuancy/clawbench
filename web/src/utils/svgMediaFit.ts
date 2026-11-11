/**
 * Proportional fill-width sizing for SVG media in rendered markdown.
 *
 * Rendered markdown shows SVG media in two forms:
 *   - an image reference:  `![alt](chart.svg)`  → `<img src="…chart.svg">`
 *   - a bare inline block: `<svg viewBox="…">…</svg>`
 *
 * Both are lifted into the unified `.image-block-wrapper` figure by the
 * media-block factory. By default a figure is `width: fit-content`, so an SVG
 * renders at its intrinsic size and leaves the reading column mostly empty.
 *
 * This module sizes SVG media into THREE zones, aiming for the biggest
 * READABLE rendering under a bounded footprint ("在限制条件下最大化渲染体验"):
 *
 *  1. COMPLETE — fits whole (column × window) at ≥90% of natural label size:
 *     renders whole, no scroll (squares, pies, landscape, short portrait).
 *  2. FILL + SCROLL — too tall to fit whole readably: fills the reading column
 *     (`width = min(avail, 2 × natural × uiScale, 5 × window × ratio)`), labels
 *     scale up with the column (vector art re-rasterises cleanly), and the
 *     CELL scrolls what does not fit. Hugging the natural width instead was
 *     what made diagrams "small" — reported twice, #570 and again on a wide
 *     tablet where the column is ~2.7× the diagram's natural size.
 *  3. END CONTROLS — a too-small diagram is capped at 2× its (ui-scaled)
 *     natural size (a 2-node sketch at full-column ~70px labels is absurd),
 *     and a too-elongated one at 5 scroll windows of content (a 1:10 sliver
 *     filled to the column would be ~13 screens of trapped scroll).
 *
 * The window height is PER SURFACE: documents (file preview, share SPA, HTML
 * export, notes) get `MEDIA_HEIGHT_FRAC_DOC` (75dvh — the reader opened the
 * document for the figure, and 60dvh was reported too short on a tablet),
 * while chat keeps `MEDIA_HEIGHT_FRAC` (60dvh — a global 75dvh was tried and
 * reverted once because a phone chat bubble plus header/input/dock left the
 * message itself off-screen). `media-block.css` mirrors the same split through
 * the `--media-window` custom property; the pairing is pinned by tests.
 *
 * Whatever the width, the artwork itself is never height-clamped: when it is
 * taller than the viewport budget the figure is stamped `.svg-scroll`
 * and `media-block.css` turns the content CELL into a vertical scroll window.
 * That split — the cell may crop, the svg may not — is what the two earlier
 * reverted attempts (bfc27b288, 965ac2ef1) were missing: they dropped the old
 * `60dvh × ratio` width term while the stylesheet still clamped the svg with
 * `max-height + object-fit: contain`, so the drawing stayed tiny and only
 * empty gutters were added.
 *
 * The ratio is still derived here and handed to the stylesheet as the
 * `--svg-ar` custom property plus the `.svg-fit` marker class (the pre-stamp
 * CSS fallback sizes from them). A figure that never gets stamped keeps the
 * shrink-only behavior, so unknown / non-SVG media is unaffected.
 *
 * Sizing reaches every surface that renders a diagram: the file-preview family
 * (file preview, code-link card, share SPA, HTML export) stamps through its
 * render pipelines, and `mermaid.ts` stamps in the SAME task that injects the
 * SVG, so chat diagrams are sized too (#570: a chat diagram is the content the
 * reader came for, not a thumbnail). Raster `<img>` is never given the fill or
 * the scroll window — its own `max-height` cap and the lightbox remain its
 * "see the whole picture" path.
 */

/** Marker class consumed by media-block.css to opt a figure into fill-width. */
import { setRefitHook } from './inlineZoom'
import { readAppliedUIScale, UI_SCALE_EVENT } from './uiScale'

/**
 * Fraction of the viewport height a rendered diagram's scroll window may
 * occupy — the CHAT value.
 *
 * MUST equal the `.chat-message { --media-window }` override `media-block.css`
 * applies to figures inside a chat bubble. This module decides WHETHER a
 * figure scrolls by comparing the filled artwork's height against the budget
 * (`mediaHeightFrac(media) × innerHeight`), and it also multiplies the budget
 * into the extreme-height cap (see `MEDIA_MAX_CONTENT_WINDOWS`); a mismatch
 * with the stylesheet would stamp figures whose window is a different height
 * than the number they were sized against. `svgMediaFit.test.ts` pins the pair.
 *
 * 60dvh (not more) is deliberate: a taller window was tried GLOBALLY (75dvh)
 * and reverted — inside a phone chat bubble the figure plus header, input bar
 * and dock left the message itself off-screen. Documents split off onto
 * `MEDIA_HEIGHT_FRAC_DOC` instead of moving chat.
 */
export const MEDIA_HEIGHT_FRAC = 0.6

/**
 * Fraction of the viewport height a diagram's scroll window may occupy in the
 * DOCUMENT surfaces (file preview, code-link card, share SPA, HTML export,
 * notes) — everywhere a figure is the content being read rather than part of a
 * conversation.
 *
 * The tablet follow-up to the three-zone work: 60dvh of a landscape tablet was
 * reported "too short" (about 1.5 nodes of a portrait flowchart between
 * scrolls, with upscaled labels eating into the visible area). 75dvh adds a
 * quarter more content per screen while still leaving the surrounding document
 * visible; chat does not follow, for the phone reason recorded on
 * `MEDIA_HEIGHT_FRAC`.
 *
 * MUST equal the default `--media-window` in `media-block.css` (`75dvh`);
 * pinned together with `MEDIA_HEIGHT_FRAC` by `svgMediaFit.test.ts`.
 */
export const MEDIA_HEIGHT_FRAC_DOC = 0.75

/**
 * The window budget that applies to THIS figure's surface, as a fraction of
 * the viewport height.
 *
 * Chat is detected structurally (`closest('.chat-message')`) rather than by a
 * marker the renderer would have to remember to pass: the chat transcript is
 * one of several `v-html` injection points with no component instance in
 * sight, and the wrapper class is the same stable hook the stylesheet override
 * uses. Every non-chat surface — file preview, code-link card, share SPA, HTML
 * export, meeting notes — is a document reader and takes the taller budget.
 */
export function mediaHeightFrac(media: Element): number {
    return media.closest('.chat-message') ? MEDIA_HEIGHT_FRAC : MEDIA_HEIGHT_FRAC_DOC
}

/**
 * How many scroll windows of content a diagram may keep when the fill-width
 * cap kicks in — the "too elongated" control.
 *
 * Filling the reading column is the default for diagrams that cannot fit whole
 * readably, and the figure's footprint in the document is already bounded at
 * the surface's window height by the scroll window. This cap bounds something
 * else: the SCROLL DEPTH trapped inside that window. A 1:10 sliver filled to
 * the column would be ~13 windows of drag/wheel to read one figure. Past this
 * many windows of content height the width is derived back from the cap
 * (`cap × ratio`), keeping even extreme diagrams readable without an absurd
 * scroll.
 *
 * 5 windows (3–3.75 viewport heights across the two surface budgets) is the
 * balance: the common LLM-generated
 * flowcharts (1:2 through ~1:5) fill the column outright or near it, and only
 * genuinely extreme shapes are narrowed.
 */
export const MEDIA_MAX_CONTENT_WINDOWS = 5

/**
 * The "too small" control: how far a diagram may be upscaled past its natural
 * size, in multiples of the natural size × the applied UI scale.
 *
 * A 2-node sketch mermaid laid out at 180px wide, filled into an 800px column,
 * would carry ~70px labels — absurd next to 16px body text. The cap keeps small
 * diagrams modest: at 2× the labels read at twice the body text, figure-like
 * but not shouting. It multiplies the UI-SCALED natural size so the ceiling
 * tracks the reader's interface zoom (labels never exceed 2× what the author's
 * 16px layout means at their text size).
 */
export const MEDIA_MAX_UPSCALE = 2

/**
 * The "complete render" threshold: a diagram that fits WHOLE (column × window
 * height) renders complete when the fitting width keeps at least this fraction
 * of its natural label size.
 *
 * This is the zone boundary between "render it whole" and "fill and scroll".
 * A square or landscape diagram fits whole at full column width with labels
 * ≥ 90% of natural — rendering it inside a scroll window instead would be
 * pure loss. A 1:4 portrait flowchart only fits whole at ~25% of its natural
 * size (~4px labels at the #570 proportions) — unreadable, so it takes the
 * fill+scroll path. 0.9 ≈ "the text is still essentially the authored size".
 */
export const MEDIA_COMPLETE_READABILITY = 0.9

export const SVG_FIT_CLASS = 'svg-fit'

/**
 * Marker class for a figure whose artwork is taller than the height budget:
 * `media-block.css` turns the content cell into a scroll window at the
 * surface's `--media-window` height (75dvh documents, 60dvh chat). The
 * cell crops the artwork; the artwork itself is never clamped (that is what
 * produced the gutters of the two reverted attempts).
 */
export const SVG_SCROLL_CLASS = 'svg-scroll'

/** Custom property carrying the media aspect ratio (width ÷ height). */
export const SVG_AR_PROP = '--svg-ar'

/**
 * `.svg` file reference, wherever it appears in a URL: a plain path (`a.svg`),
 * a cache-busted path (`a.svg?t=1`), a hash (`a.svg#id`), or an encoded query
 * parameter (`?path=%2Ftmp%2Fa.svg&t=1`, the share-mode / absolute-path form).
 * The lookahead keeps a longer extension (`a.svgz`) from matching.
 */
const SVG_SRC_RE = /\.svg(?![A-Za-z0-9])/i

/** Inline SVG served as a data URI (the HTML export inlines images). */
const SVG_DATA_RE = /^data:image\/svg\+xml/i

/** True when an image `src` points at an SVG, in any of the served URL forms. */
export function isSvgImageSrc(src: string | null | undefined): boolean {
    if (!src) return false
    return SVG_SRC_RE.test(src) || SVG_DATA_RE.test(src)
}

/**
 * Parse a plain CSS length (`200`, `200px`) into a positive number. Percentage
 * and unit-bearing values are rejected: they cannot express an aspect ratio.
 */
function parseLengthAttr(value: string | null): number | null {
    if (!value) return null
    const m = value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
    if (!m) return null
    const n = parseFloat(m[1])
    return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Aspect ratio (width ÷ height) of an SVG media element, or null when the
 * element is not SVG media or its ratio cannot be determined yet.
 *
 * - inline `<svg>`: `width`/`height` attributes win; otherwise `viewBox`
 *   (this needs no load, so inline blocks are sized on the first pass);
 * - `<img>` pointing at an SVG: the browser-derived intrinsic size, which is
 *   only available once the image has loaded (null until then — the figure
 *   simply keeps its previous size and is re-stamped on the load event).
 */
export function svgMediaAspectRatio(el: Element | null): number | null {
    if (!el) return null
    const tag = el.tagName.toLowerCase()

    if (tag === 'svg') {
        const w = parseLengthAttr(el.getAttribute('width'))
        const h = parseLengthAttr(el.getAttribute('height'))
        if (w !== null && h !== null) return w / h

        const vb = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/)
        if (vb.length === 4) {
            const vw = parseFloat(vb[2])
            const vh = parseFloat(vb[3])
            if (Number.isFinite(vw) && Number.isFinite(vh) && vw > 0 && vh > 0) return vw / vh
        }
        return null
    }

    if (tag === 'img') {
        const img = el as HTMLImageElement
        if (!isSvgImageSrc(img.getAttribute('src'))) return null
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            return img.naturalWidth / img.naturalHeight
        }
        return null
    }

    return null
}

/**
 * The figure's CONTENT cell media — deliberately `:scope >`-anchored so the
 * toolbar's own icon SVGs (inside `.image-block-header`) are never mistaken for
 * content media.
 *
 * Three shapes are covered:
 *   - `.lightbox-img-wrap > img`   an `<img>` (an SVG file reference)
 *   - `.lightbox-svg-wrap > svg`   a bare inline `<svg>` (marked `lightbox-svg`)
 *   - `.mermaid > svg`             a rendered Mermaid diagram
 * A Mermaid diagram renders through its own path (mermaid.ts → armMermaidFigure)
 * and its `<svg>` carries no `lightbox-svg` marker, so it needs its own entry.
 */
const CONTENT_MEDIA_SELECTOR =
    ':scope > .lightbox-svg-wrap > svg.lightbox-svg, ' +
    ':scope > .lightbox-img-wrap > img, ' +
    ':scope > .mermaid > svg'

/**
 * Stamp one `.image-block-wrapper` with its media's aspect ratio. Returns true
 * when the figure is now (or already was) sized; false when the media is not
 * SVG or its ratio is not yet known.
 */
export function stampSvgFigure(wrapper: Element): boolean {
    const media = wrapper.querySelector(CONTENT_MEDIA_SELECTOR)
    if (!media) return false
    const ar = svgMediaAspectRatio(media)
    if (ar === null || !Number.isFinite(ar) || ar <= 0) return false
    ;(wrapper as HTMLElement).style.setProperty(SVG_AR_PROP, String(ar))
    wrapper.classList.add(SVG_FIT_CLASS)
    applyMediaWidth(wrapper as HTMLElement, media as HTMLElement, ar)
    return true
}

/**
 * The width actually available to a figure's media, in CSS pixels.
 *
 * Two things make the obvious measurement (`column.getBoundingClientRect()
 * .width`) wrong, and both produce the SAME symptom: a diagram wider than its
 * frame, so `.mermaid`'s `overflow-x: auto` draws a horizontal scrollbar that
 * is nearly full-width (#570 follow-up, reported on mobile).
 *
 *  1. **The rect is the border box.** The reading column has horizontal padding
 *     (16px per side in the file preview), and the figure adds a 1px border of
 *     its own. Sizing the media to the border box overflows the CONTENT box by
 *     `padding + border` — measured 34px on a 390px phone.
 *  2. **The rect is zoom-scaled.** The appearance setting applies
 *     `html { zoom }`, which multiplies `getBoundingClientRect()` but NOT
 *     `style.width` (a CSS px value). At zoom 1.25 the same page overflowed by
 *     112px instead of 34px.
 *
 * `clientWidth` answers both: it is the content+padding box in unscaled CSS
 * pixels, and it already excludes borders and any scrollbar. Subtracting the
 * computed padding leaves the content box; the figure's own horizontal borders
 * are subtracted on top of that, because the media sits inside them.
 *
 * Falls back to the rect when `clientWidth` is unavailable (a detached or
 * `display: none` column reports 0), so a not-yet-laid-out figure keeps the
 * old behaviour instead of collapsing to zero width.
 */
function availableColumnWidth(wrapper: HTMLElement, column: HTMLElement): number {
    const inner = column.clientWidth
    if (inner > 0) {
        const style = getComputedStyle(column)
        const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
        const wrapStyle = getComputedStyle(wrapper)
        const borderX =
            (parseFloat(wrapStyle.borderLeftWidth) || 0) + (parseFloat(wrapStyle.borderRightWidth) || 0)
        return Math.max(0, inner - padX - borderX)
    }
    return column.getBoundingClientRect().width
}

/**
 * Width of a classic (space-taking) scrollbar, in px; 0 on overlay-scrollbar
 * platforms.
 *
 * A `.svg-scroll` cell shows one when its artwork overflows, and the bar eats
 * into the cell's content width. The media's width is a FIXED pixel value, so
 * without an allowance the artwork would poke `bar-width` past the cell and a
 * horizontal scrollbar would appear under the vertical one. The allowance is
 * probed once (an off-screen `overflow-y: scroll` div) rather than guessed:
 * macOS and every touch platform report 0 (overlay bars take no layout space),
 * desktop Chromium/Firefox on Windows/Linux report 15–17. jsdom reports 0,
 * which keeps the unit tests deterministic.
 */
let _scrollbarWidth: number | null = null
function scrollbarAllowance(): number {
    if (_scrollbarWidth === null) {
        if (typeof document === 'undefined') return 0
        const probe = document.createElement('div')
        probe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;overflow-y:scroll;'
        document.body.appendChild(probe)
        _scrollbarWidth = Math.max(0, probe.offsetWidth - probe.clientWidth)
        probe.remove()
    }
    return _scrollbarWidth
}

/**
 * Whether the figure's media is vector art eligible for the scroll window.
 * Raster `<img>` keeps its own `max-height + object-fit` cap — its "see it
 * all / see it big" path is the lightbox, not an in-figure scroll.
 */
function isVectorMedia(media: HTMLElement): boolean {
    return media.tagName.toLowerCase() === 'svg'
}

/**
 * Write the media's pixel width from its ratio, clamped to the column.
 *
 * The width MUST be a resolved pixel value, not a percentage. The figure is
 * shrink-to-fit around this element, and the element's `max-width: 100%` would
 * be relative to the figure — so the two would depend on each other. The
 * browser breaks that cycle by falling back to the default 300px
 * replaced-element width, which squashed every wide diagram to 300px.
 *
 * Resolving it here removes the cycle: the script knows the ratio and can
 * measure the available column width, so it writes a number the layout can
 * use directly. See `availableColumnWidth` for why that number is the CONTENT
 * box in CSS pixels rather than the parent's rect.
 */
function applyMediaWidth(wrapper: HTMLElement, media: HTMLElement, ar: number): void {
    const column = wrapper.parentElement
    if (!column) return
    const avail = availableColumnWidth(wrapper, column)
    if (!(avail > 0)) return

    // Three zones, one goal — the biggest READABLE rendering under a bounded
    // footprint ("在限制条件下最大化图形渲染的体验"):
    //
    //  1. COMPLETE. A diagram that fits whole (column × window height) while
    //     keeping ≥ MEDIA_COMPLETE_READABILITY of its natural label size
    //     renders WHOLE: no scroll window, no upscale gymnastics — the figure
    //     is simply there, like any other block. Squares, pies, landscape
    //     flowcharts and short portrait charts live here.
    //  2. FILL + SCROLL. A diagram too tall to fit whole readably (the #570
    //     portrait flowcharts) fills the column instead: vector art upscales
    //     cleanly, labels grow with the column, and the CELL's scroll window
    //     (75dvh documents / 60dvh chat) bounds the figure's footprint.
    //  3. CONTROLS at both ends. A too-SMALL diagram must not fill the column
    //     (a 2-node sketch at ~70px labels is absurd): the upscale cap
    //     (MEDIA_MAX_UPSCALE × natural × uiScale) bounds it. A too-ELONGATED
    //     diagram must not become ten screens of trapped scroll: past
    //     MEDIA_MAX_CONTENT_WINDOWS windows of content the width is derived
    //     back from the cap.
    //
    // In both zones the artwork itself is never height-clamped — the CELL
    // crops it via `.svg-scroll` (the svg clamp was the mechanism behind the
    // two reverted gutters attempts, bfc27b288 and 965ac2ef1). Raster <img>
    // keeps the whole-visible budget×ratio width below: its stylesheet rule
    // clamps with `max-height + object-fit`, so an overflowing stamp would
    // only add gutters, and upscaling a photo only blurs it.
    const vector = isVectorMedia(media)
    const budget = window.innerHeight * mediaHeightFrac(media)
    if (!vector) {
        const width = Math.min(avail, budget * ar)
        if (!(width > 0)) return
        media.style.width = `${Math.round(width * 100) / 100}px`
        wrapper.classList.toggle(SVG_SCROLL_CLASS, false)
        return
    }
    const scale = readAppliedUIScale()
    const natural = intrinsicWidth(media, ar, budget) * scale
    const upscaleCap = MEDIA_MAX_UPSCALE * natural
    const completeW = Math.min(avail, budget * ar, upscaleCap)
    const width = completeW >= natural * MEDIA_COMPLETE_READABILITY
        ? completeW
        : Math.min(avail, upscaleCap, MEDIA_MAX_CONTENT_WINDOWS * budget * ar)
    // Scroll decision from the PRE-allowance width: the allowance only trims
    // the bar's layout space, it does not change whether the artwork overflows
    // meaningfully. A figure that ends up a hair shorter than the window shows
    // no scrollbar either way (overflow-y: auto with fitting content).
    const scrolls = width / ar > budget
    const final = scrolls ? Math.max(0, width - scrollbarAllowance()) : width
    if (!(final > 0)) return
    media.style.width = `${Math.round(final * 100) / 100}px`
    // Height follows the width through the ratio, so no separate value is
    // written; `height: auto` in CSS derives it from the viewBox.
    wrapper.classList.toggle(SVG_SCROLL_CLASS, scrolls)
}

/**
 * The artwork's own width, before any fitting — the RAW natural size, not
 * multiplied by the UI scale (the caller scales it where the zone policy
 * needs it).
 *
 * `viewBox` is the authored coordinate space, but an svg may also carry
 * `width`/`height` attributes or an inline `style="max-width: Npx"` (mermaid
 * does both) that state its intended display size. The inline max-width is the
 * best signal for "how big did the author mean this to be", so it wins when
 * present; otherwise the viewBox width is used.
 */
function intrinsicWidth(media: HTMLElement, ar: number, budget: number): number {
    // `parsePx` (not `parseFloat`) on purpose: mermaid writes `width="100%"` on
    // the svg, and `parseFloat('100%')` is 100 — a percentage read as a pixel
    // count silently shrank diagrams to 100px. Only a px value counts.
    const inlineMax = parsePx(media.style.maxWidth)
    if (inlineMax !== null) return inlineMax
    const attrW = parsePx(media.getAttribute('width'))
    if (attrW !== null) return attrW
    const vb = (media as unknown as SVGSVGElement).viewBox?.baseVal
    if (vb && vb.width > 0) return vb.width
    // Last resort: derive from the height budget so a ratio is still honoured.
    return budget * ar
}

/**
 * Parse a CSS length that must be an absolute pixel value.
 *
 * Returns null for percentages, `auto`, `none`, and anything else that is not a
 * plain `Npx`. A percentage here is not just wrong — it is actively harmful:
 * `parseFloat` would turn `100%` into 100 and shrink the diagram to a sliver.
 */
function parsePx(value: string | null | undefined): number | null {
    if (!value) return null
    const m = /^\s*([\d.]+)px\s*$/.exec(value)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Stamp every figure under `root` whose ratio can be resolved synchronously.
 * Idempotent — safe to call after each render and on every media load event.
 * Returns the number of figures sized by this pass.
 */
export function stampSvgFigures(root: ParentNode | null): number {
    if (!root) return 0
    let stamped = 0
    for (const wrapper of Array.from(root.querySelectorAll('.image-block-wrapper'))) {
        if (stampSvgFigure(wrapper)) stamped++
    }
    return stamped
}

/**
 * Await the load of any not-yet-decoded SVG image under `root`, then stamp.
 *
 * The HTML exporter needs this: it mounts the rendered document into a hidden
 * host, where `<img>` elements have not loaded, so their intrinsic size is not
 * available to the synchronous pass.
 */
export async function stampSvgFiguresAsync(root: ParentNode | null): Promise<void> {
    if (!root) return
    const pending: Array<Promise<unknown>> = []
    for (const el of Array.from(root.querySelectorAll('.image-block-wrapper > .lightbox-img-wrap > img'))) {
        const img = el as HTMLImageElement
        if (!isSvgImageSrc(img.getAttribute('src'))) continue
        if (img.naturalWidth > 0 && img.naturalHeight > 0) continue
        if (typeof img.decode === 'function') pending.push(img.decode().catch(() => undefined))
    }
    if (pending.length > 0) await Promise.all(pending)
    stampSvgFigures(root)
}

/**
 * Re-size every stamped SVG figure when the space available to it changes.
 *
 * `applyMediaWidth` writes a resolved pixel width, which is what breaks the
 * figure↔media cycle — but a pixel value is frozen at the moment it was
 * written. Without this, resizing the window (or collapsing a side panel) left
 * every diagram at its old width: too wide (overflowing) when the column shrank,
 * and wasting the new space when it grew.
 *
 * Two signals, because they answer different questions:
 *  - `ResizeObserver` on each figure's parent: the COLUMN changed. This is the
 *    one that catches side-panel toggles, which do not resize the window.
 *  - `resize` on the window: the VIEWPORT HEIGHT changed, which moves the
 *    window budget and therefore the width of a height-limited diagram. The column's
 *    own width may not change at all in that case, so the observer alone would
 *    miss it.
 *
 * Re-entrancy: writing a width changes the figure's size, which fires the
 * observer again. That is harmless — the next pass measures the same column and
 * writes the same width, so it converges. (The `writing` flag this used to rely
 * on could never work: it was set during the synchronous pass, while observer
 * callbacks are delivered asynchronously and always observed it as false.)
 */
export function installSvgMediaAutoFit(): () => void {
    if (typeof window === 'undefined' || typeof ResizeObserver !== 'function') {
        return () => {}
    }
    let frame = 0
    // What to re-measure on the next pass.
    //
    // `all` is the only correct answer for a viewport resize: the window height
    // budget changed, so every height-limited diagram needs a new width.
    //
    // A MutationObserver hit, by contrast, concerns only the figures it added:
    // the chat transcript replaces innerHTML on every streaming frame, and
    // re-measuring every figure in the document on each of those frames is a
    // forced synchronous layout over the whole page — measurable on sessions
    // with a dozen diagrams. Same for a ResizeObserver hit, which names the
    // columns that actually changed.
    let all = false
    const pending = new Set<Element>()

    const flush = () => {
        const targets = all
            ? Array.from(document.querySelectorAll('.image-block-wrapper'))
            : Array.from(pending)
        all = false
        pending.clear()
        for (const wrapper of targets) {
            refitFigure(wrapper as HTMLElement)
        }
    }

    // Coalesce bursts (a window drag fires resize on every frame) into one pass
    // per animation frame.
    const schedule = (opts: { all?: boolean; touched?: Iterable<Element> }) => {
        if (opts.all) {
            all = true
            pending.clear()
        } else if (opts.touched) {
            for (const el of opts.touched) pending.add(el)
        }
        if (frame) return
        frame = requestAnimationFrame(() => {
            frame = 0
            flush()
        })
    }

    // ResizeObserver: the observed column changed size. Re-measure only the
    // figures directly under the columns that fired.
    //
    // No re-entrancy flag is needed (and the one that used to live here never
    // worked: it was set during the synchronous pass, while ResizeObserver
    // callbacks arrive asynchronously and always read it as false). Writing a
    // width does fire the observer again, but the next pass measures the same
    // column, computes the same width and writes an identical value, so it
    // converges instead of looping.
    const observer = new ResizeObserver((entries) => {
        const touched = new Set<Element>()
        for (const entry of entries) {
            for (const wrapper of Array.from(entry.target.querySelectorAll(':scope > .image-block-wrapper'))) {
                touched.add(wrapper)
            }
        }
        if (touched.size > 0) schedule({ touched })
    })
    const observed = new WeakSet<Element>()
    const observeAll = () => {
        for (const wrapper of Array.from(document.querySelectorAll('.image-block-wrapper'))) {
            const column = wrapper.parentElement
            if (column && !observed.has(column)) {
                observed.add(column)
                observer.observe(column)
            }
        }
    }

    // New figures are added by every render, so re-scan on mutations rather than
    // only once at install time.
    //
    // The trigger is not "a wrapper was added": a mermaid re-render REPLACES the
    // contents of the existing `.mermaid` container (`container.innerHTML =
    // result.svg` in mermaid.ts, on every theme/font change), so the added nodes
    // are a fresh `<svg>` / `.lightbox-*` wrap and no `.image-block-wrapper`
    // appears at all. Keying on the wrapper alone missed exactly that case — the
    // diagram kept the inline px width computed for the OLD theme/font until the
    // next window resize. Resolve the nearest enclosing figure instead, so any
    // change to a figure's media re-measures it.
    const mutation = new MutationObserver((records) => {
        observeAll()
        const touched = new Set<Element>()
        const noteFigure = (node: Element) => {
            const figure = node.closest('.image-block-wrapper')
            if (figure) touched.add(figure)
        }
        for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
                if (!(node instanceof Element)) continue
                noteFigure(node)
                for (const nested of Array.from(node.querySelectorAll(CONTENT_MEDIA_SELECTOR))) {
                    noteFigure(nested)
                }
            }
        }
        // No figure content changed (the common case: text streaming into an
        // existing paragraph) — nothing to re-measure.
        if (touched.size > 0) schedule({ touched })
    })
    mutation.observe(document.body, { childList: true, subtree: true })

    const onViewportResize = () => schedule({ all: true })

    // A UI-scale change resizes every rem-sized element but never fires
    // `resize`, and the zone widths are derived from the UI-SCALED natural
    // size — so every figure needs a re-stamp when the reader moves the
    // interface-zoom slider. The event is the documented signal for exactly
    // this ("缩放变化不触发 resize，靠 UI_SCALE_EVENT 广播"); a root-font change
    // also fires the ResizeObservers, but those only re-fit the columns they
    // name, while the scale changed the target size of ALL of them.
    const onUIScaleChange = () => schedule({ all: true })

    observeAll()
    window.addEventListener('resize', onViewportResize)
    window.addEventListener(UI_SCALE_EVENT, onUIScaleChange as EventListener)

    return () => {
        observer.disconnect()
        mutation.disconnect()
        window.removeEventListener('resize', onViewportResize)
        window.removeEventListener(UI_SCALE_EVENT, onUIScaleChange as EventListener)
        if (frame) cancelAnimationFrame(frame)
    }
}

/**
 * Re-measure one figure. No-op for anything `stampSvgFigure` never sized.
 *
 * Also registered with `inlineZoom` as its exit hook, so leaving the zoom
 * recomputes the resting width against the CURRENT column instead of restoring
 * a value captured before the column changed.
 */
export function refitFigure(wrapper: HTMLElement): void {
    if (!wrapper.classList.contains(SVG_FIT_CLASS)) return
    // While zoomed the media's size is owned by `inlineZoom`, which recomputes
    // from the frame on every step; writing here would fight it.
    if (wrapper.classList.contains('is-zooming')) return
    const media = wrapper.querySelector(CONTENT_MEDIA_SELECTOR)
    if (!media) return
    const ar = svgMediaAspectRatio(media)
    if (ar === null || !Number.isFinite(ar) || ar <= 0) return
    applyMediaWidth(wrapper, media as HTMLElement, ar)
}

setRefitHook(refitFigure)
