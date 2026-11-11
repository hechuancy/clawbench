import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MEDIA_HEIGHT_FRAC,
  MEDIA_HEIGHT_FRAC_DOC,
  SVG_FIT_CLASS,
  SVG_SCROLL_CLASS,
  SVG_AR_PROP,
  isSvgImageSrc,
  svgMediaAspectRatio,
  refitFigure,
  stampSvgFigure,
  stampSvgFigures,
  stampSvgFiguresAsync,
  installSvgMediaAutoFit,
} from '@/utils/svgMediaFit'
import { readWebFile } from '@/testUtils/readWebFile'

/** Build a detached figure the way the media-block factory does. */
function figure(inner: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<div class="image-block-wrapper">${inner}</div>`
  return host.querySelector('.image-block-wrapper') as HTMLElement
}

const svgWrap = (svg: string) => `<span class="lightbox-svg-wrap">${svg}</span>`
const imgWrap = (src: string, cls = 'lightbox-img') =>
  `<span class="lightbox-img-wrap"><img class="${cls}" src="${src}"></span>`

/** jsdom never loads images, so natural size must be injected. */
function withNaturalSize(img: HTMLImageElement, w: number, h: number): void {
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true })
}

describe('isSvgImageSrc', () => {
  it('matches every served form of an SVG reference', () => {
    expect(isSvgImageSrc('chart.svg')).toBe(true)
    expect(isSvgImageSrc('/api/fs/raw/docs/chart.svg?t=1')).toBe(true)
    expect(isSvgImageSrc('/api/fs/raw/docs/chart.svg#frag')).toBe(true)
    // Share mode / absolute paths encode the target in a query parameter.
    expect(isSvgImageSrc('/api/share/tok/local?path=%2Ftmp%2Fchart.svg&t=1')).toBe(true)
    expect(isSvgImageSrc('data:image/svg+xml;base64,PHN2Zy8+')).toBe(true)
  })

  it('does not match raster formats or unrelated srcs', () => {
    expect(isSvgImageSrc('photo.png')).toBe(false)
    expect(isSvgImageSrc('/api/fs/thumb?target=docs/a.jpg&w=1200')).toBe(false)
    expect(isSvgImageSrc('')).toBe(false)
    expect(isSvgImageSrc(null)).toBe(false)
    expect(isSvgImageSrc(undefined)).toBe(false)
  })

  it('does not match a longer extension that merely starts with .svg', () => {
    expect(isSvgImageSrc('archive.svgz')).toBe(false)
  })
})

describe('svgMediaAspectRatio — inline <svg>', () => {
  it('uses width/height attributes when both are present', () => {
    const el = new DOMParser().parseFromString(
      '<svg viewBox="0 0 100 400" width="200" height="100"></svg>', 'text/html'
    ).querySelector('svg')!
    // Attributes win over the (contradictory) viewBox.
    expect(svgMediaAspectRatio(el)).toBeCloseTo(2)
  })

  it('accepts px-suffixed lengths', () => {
    const el = new DOMParser().parseFromString(
      '<svg width="300px" height="100px"></svg>', 'text/html'
    ).querySelector('svg')!
    expect(svgMediaAspectRatio(el)).toBeCloseTo(3)
  })

  it('falls back to viewBox when width/height are absent', () => {
    const el = new DOMParser().parseFromString(
      '<svg viewBox="0 0 400 100"></svg>', 'text/html'
    ).querySelector('svg')!
    expect(svgMediaAspectRatio(el)).toBeCloseTo(4)
  })

  it('falls back to viewBox when only one dimension attribute is present', () => {
    const el = new DOMParser().parseFromString(
      '<svg viewBox="0 0 400 100" width="200"></svg>', 'text/html'
    ).querySelector('svg')!
    expect(svgMediaAspectRatio(el)).toBeCloseTo(4)
  })

  it('accepts a comma-separated viewBox', () => {
    const el = new DOMParser().parseFromString(
      '<svg viewBox="0,0,300,100"></svg>', 'text/html'
    ).querySelector('svg')!
    expect(svgMediaAspectRatio(el)).toBeCloseTo(3)
  })

  it('returns null when neither attributes nor a usable viewBox exist', () => {
    const el = new DOMParser().parseFromString('<svg></svg>', 'text/html').querySelector('svg')!
    expect(svgMediaAspectRatio(el)).toBeNull()
  })

  it('rejects a degenerate viewBox (zero height) instead of dividing by zero', () => {
    const el = new DOMParser().parseFromString(
      '<svg viewBox="0 0 100 0"></svg>', 'text/html'
    ).querySelector('svg')!
    expect(svgMediaAspectRatio(el)).toBeNull()
  })

  it('rejects percentage dimensions — they cannot express a ratio', () => {
    const el = new DOMParser().parseFromString(
      '<svg width="100%" height="50%" viewBox="0 0 10 5"></svg>', 'text/html'
    ).querySelector('svg')!
    // Falls through to viewBox.
    expect(svgMediaAspectRatio(el)).toBeCloseTo(2)
  })
})

describe('svgMediaAspectRatio — <img>', () => {
  it('uses the intrinsic size of an SVG image once decoded', () => {
    const host = document.createElement('div')
    host.innerHTML = imgWrap('chart.svg')
    const img = host.querySelector('img')!
    withNaturalSize(img, 400, 100)
    expect(svgMediaAspectRatio(img)).toBeCloseTo(4)
  })

  it('returns null for a raster image (only SVG media is resized)', () => {
    const host = document.createElement('div')
    host.innerHTML = imgWrap('photo.png')
    const img = host.querySelector('img')!
    withNaturalSize(img, 400, 100)
    expect(svgMediaAspectRatio(img)).toBeNull()
  })

  it('returns null for an SVG image that has not decoded yet', () => {
    const host = document.createElement('div')
    host.innerHTML = imgWrap('chart.svg')
    // jsdom reports 0x0 until a size is injected — mirrors the real "not loaded".
    expect(svgMediaAspectRatio(host.querySelector('img')!)).toBeNull()
  })

  it('returns null for a non-media element', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="mermaid"></div>'
    expect(svgMediaAspectRatio(host.querySelector('.mermaid'))).toBeNull()
  })

  it('returns null for null input', () => {
    expect(svgMediaAspectRatio(null)).toBeNull()
  })
})

describe('stampSvgFigure', () => {
  it('stamps the marker class and ratio on an inline-svg figure', () => {
    const w = figure(svgWrap('<svg class="lightbox-svg" viewBox="0 0 400 100"></svg>'))
    expect(stampSvgFigure(w)).toBe(true)
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(true)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe('4')
  })

  it('stamps an SVG-file image figure once the image has decoded', () => {
    const w = figure(imgWrap('/api/fs/raw/docs/chart.svg?t=1'))
    withNaturalSize(w.querySelector('img')!, 100, 400)
    expect(stampSvgFigure(w)).toBe(true)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe('0.25')
  })

  it('leaves a raster image figure untouched', () => {
    const w = figure(imgWrap('/api/fs/thumb?target=docs/a.png&w=1200'))
    withNaturalSize(w.querySelector('img')!, 400, 100)
    expect(stampSvgFigure(w)).toBe(false)
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(false)
  })

  it('stamps a mermaid figure from its diagram viewBox', () => {
    // Mermaid renders through its own path (mermaid.ts → armMermaidFigure) as
    // `.image-block-wrapper > .mermaid > svg` with NO `lightbox-svg` marker.
    // It is still SVG media and must be sized like the rest — a wide flowchart
    // otherwise collapses to the 300px default replaced-element width inside
    // the fit-content figure.
    const w = figure('<div class="mermaid"><svg viewBox="0 0 1008.125 70"></svg></div>')
    expect(stampSvgFigure(w)).toBe(true)
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(true)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe(String(1008.125 / 70))
  })

  it('stamps a mermaid figure whose svg carries width/height attributes', () => {
    const w = figure('<div class="mermaid"><svg width="400" height="100" viewBox="0 0 400 100"></svg></div>')
    expect(stampSvgFigure(w)).toBe(true)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe('4')
  })

  it('ignores the toolbar icon svg inside the header', () => {
    // Only the CONTENT cell media counts; the view button's own icon has a
    // viewBox too and must not be picked up.
    const w = figure(
      '<div class="image-block-header"><span class="image-block-header-actions">'
      + '<button class="image-block-view-btn"><svg viewBox="0 0 24 24"></svg></button>'
      + '</span></div>'
      + imgWrap('/api/fs/raw/docs/photo.png')
    )
    withNaturalSize(w.querySelector('img')!, 400, 100)
    expect(stampSvgFigure(w)).toBe(false)
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(false)
  })

  it('returns false for an svg with no resolvable ratio', () => {
    const w = figure(svgWrap('<svg class="lightbox-svg"></svg>'))
    expect(stampSvgFigure(w)).toBe(false)
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(false)
  })

  it('is idempotent and re-stamps when the ratio changes', () => {
    const w = figure(svgWrap('<svg class="lightbox-svg" viewBox="0 0 400 100"></svg>'))
    stampSvgFigure(w)
    stampSvgFigure(w)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe('4')
    // A later pass with a corrected ratio overwrites rather than duplicating.
    const svg = w.querySelector('svg')!
    svg.setAttribute('viewBox', '0 0 100 400')
    stampSvgFigure(w)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe('0.25')
    expect(w.className).toBe('image-block-wrapper svg-fit')
  })
})

describe('stampSvgFigures', () => {
  it('stamps every eligible figure under a root and skips the rest', () => {
    const host = document.createElement('div')
    host.innerHTML = [
      figure(svgWrap('<svg class="lightbox-svg" viewBox="0 0 400 100"></svg>')).outerHTML,
      figure(imgWrap('/api/fs/raw/docs/chart.svg?t=1')).outerHTML,
      figure(imgWrap('/api/fs/thumb?target=a.png&w=1200')).outerHTML,
    ].join('')
    withNaturalSize(host.querySelectorAll('img')[0], 100, 400)

    expect(stampSvgFigures(host)).toBe(2)
    const wraps = host.querySelectorAll('.image-block-wrapper')
    expect(wraps[0].classList.contains(SVG_FIT_CLASS)).toBe(true)
    expect(wraps[1].classList.contains(SVG_FIT_CLASS)).toBe(true)
    expect(wraps[2].classList.contains(SVG_FIT_CLASS)).toBe(false)
  })

  it('returns 0 for a null root', () => {
    expect(stampSvgFigures(null)).toBe(0)
  })
})

describe('stampSvgFiguresAsync', () => {
  it('awaits decode of an unloaded SVG image before stamping', async () => {
    const w = figure(imgWrap('chart.svg'))
    const img = w.querySelector('img')!
    let decoded = false
    Object.defineProperty(img, 'decode', {
      value: () => Promise.resolve().then(() => {
        decoded = true
        withNaturalSize(img, 400, 100)
      }),
      configurable: true,
    })

    await stampSvgFiguresAsync(w.parentElement)
    expect(decoded).toBe(true)
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(true)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe('4')
  })

  it('does not await decode for an already-sized SVG image', async () => {
    const w = figure(imgWrap('chart.svg'))
    const img = w.querySelector('img')!
    withNaturalSize(img, 200, 100)
    let decodeCalls = 0
    Object.defineProperty(img, 'decode', {
      value: () => { decodeCalls++; return Promise.resolve() },
      configurable: true,
    })

    await stampSvgFiguresAsync(w.parentElement)
    expect(decodeCalls).toBe(0)
    expect(w.style.getPropertyValue(SVG_AR_PROP)).toBe('2')
  })

  it('does not await decode for a raster image', async () => {
    const w = figure(imgWrap('photo.png'))
    const img = w.querySelector('img')!
    let decodeCalls = 0
    Object.defineProperty(img, 'decode', {
      value: () => { decodeCalls++; return Promise.resolve() },
      configurable: true,
    })

    await stampSvgFiguresAsync(w.parentElement)
    expect(decodeCalls).toBe(0)
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(false)
  })

  it('tolerates a decode rejection without throwing', async () => {
    const w = figure(imgWrap('broken.svg'))
    const img = w.querySelector('img')!
    Object.defineProperty(img, 'decode', {
      value: () => Promise.reject(new Error('broken')),
      configurable: true,
    })

    await expect(stampSvgFiguresAsync(w.parentElement)).resolves.toBeUndefined()
    // No size available — the figure keeps its default (shrink-only) sizing.
    expect(w.classList.contains(SVG_FIT_CLASS)).toBe(false)
  })

  it('resolves for a null root', async () => {
    await expect(stampSvgFiguresAsync(null)).resolves.toBeUndefined()
  })
})

describe('resting media width (svgMediaFit)', () => {
  const mkSvg = (vbW: number, vbH: number, inlineMax?: number) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
    if (inlineMax) svg.style.maxWidth = `${inlineMax}px`
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    // jsdom has no layout; give the column a width the module can measure.
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 0, top: 0, left: 0, right: 800, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })
    return { wrapper, svg, column }
  }

  const originalInnerHeight = window.innerHeight
  afterEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })
  /** Pin the viewport: every zone boundary derives from the window budget
   *  (75dvh in these non-chat fixtures, 60dvh inside `.chat-message`). */
  const setViewportHeight = (h: number) => {
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
  }

  it('renders a small diagram complete at the upscale cap instead of filling the column', () => {
    setViewportHeight(900)
    // A 250px diagram filled into the 800px column would carry ~51px labels —
    // shouting next to 16px body text. The "too small" control caps the
    // upscale at 2× natural: 500px, labels 32px (figure-like, readable), and
    // because it fits whole it renders COMPLETE — no scroll window.
    const { wrapper, svg } = mkSvg(250, 70, 250)
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(500)
    expect(wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(false)
  })

  it('fills the column with a moderate landscape diagram, whole and uncapped', () => {
    setViewportHeight(900)
    // Natural 500×200 in an 800px column: fits whole at full width (height
    // 320 ≤ 75dvh=675), labels keep ≥ 90% of natural at the column width —
    // the COMPLETE zone at its best: "适当长度和宽度 → 直接完整渲染".
    const { wrapper, svg } = mkSvg(500, 200, 500)
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(800)
    expect(wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(false)
  })

  it('renders a square diagram complete at the height budget, not scrolled', () => {
    setViewportHeight(900)
    // 400×400 natural: filling the 800px column would make it 800 tall — over
    // the 675px budget — but fitting whole needs only 675 wide, where the
    // labels keep 168% of natural (≥ 90% → readable). Complete wins: whole,
    // no scroll window.
    const { wrapper, svg } = mkSvg(400, 400, 400)
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(675)
    expect(wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(false)
  })

  it('shrinks a diagram wider than the column down to the column', () => {
    const { wrapper, svg } = mkSvg(1600, 70, 1600)
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBeLessThanOrEqual(800)
  })

  it('ignores a percentage width attribute instead of reading it as pixels', () => {
    // mermaid writes `width="100%"`. `parseFloat('100%')` is 100, so treating
    // the attribute as a pixel count shrank the diagram to a 100px sliver.
    const { wrapper, svg } = mkSvg(1600, 70)
    svg.setAttribute('width', '100%')
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).not.toBe(100)
    // Falls through to the viewBox width, clamped to the column.
    expect(parseFloat(svg.style.width)).toBe(800)
  })

  it('writes a resolved pixel width, never a percentage', () => {
    // A percentage would be relative to the shrink-to-fit figure, which is sized
    // by this element — the cycle that collapses everything to 300px.
    const { wrapper, svg } = mkSvg(1600, 70, 1600)
    stampSvgFigure(wrapper)
    expect(svg.style.width).toMatch(/^[\d.]+px$/)
    expect(svg.style.width).not.toContain('%')
  })
})

/**
 * Tall diagrams at rest.
 *
 * #570 reported a 302x1182 flowchart rendered as an unreadable sliver: the
 * height budget bounded the WIDTH (`min(intrinsic, avail, 60dvh × ar)`), so a
 * 1:3.9 artwork collapsed to ~138px of ~7px text and reading it meant
 * click-to-zoom. The contract below FILLS the reading column and keeps only an
 * extreme-height carve-out:
 *
 *   width = min(avail, 2 × natural, 5 × budget × ar)
 *   height > budget?                    — `.svg-scroll` stamped; the CELL becomes
 *                                         a 60dvh scroll window (`media-block.css`)
 *
 * Dropping the budget term alone was tried twice (bfc27b288, 965ac2ef1) and
 * reverted both times — the stylesheet still clamped the svg itself with
 * `max-height + object-fit: contain`, so the drawing stayed exactly as tiny and
 * the wider frame only added ~82px of empty gutter per side. The CELL crops the
 * artwork, never the svg. These assertions pin the JS half; the CSS half (scroll
 * window exists, the svg carries no max-height at rest) is pinned by
 * MarkdownPreviewSvgFit.css.test.ts.
 */
describe('tall diagram width (fill column, extreme-height cap, scroll window)', () => {
  /** 302x1182 is the flowchart from #570 — the case the whole debate is about. */
  const PORTRAIT_W = 302
  const PORTRAIT_H = 1182
  const AR = PORTRAIT_W / PORTRAIT_H

  const mkPortrait = () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${PORTRAIT_W} ${PORTRAIT_H}`)
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 0, top: 0, left: 0, right: 800, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })
    return { wrapper, svg, column }
  }

  const originalInnerHeight = window.innerHeight
  afterEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  function setViewportHeight(h: number) {
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
  }

  it('fills toward the column, bounded by the 2× upscale cap', () => {
    // The complete-fit width (675 × ar ≈ 173px) is far below the 90%
    // readability floor, so the diagram takes the FILL path. At a 900px
    // viewport the 2×-natural cap (604px) binds before both the column (800)
    // and the 5-window cap (862px): 604px, 2× the authored 16px labels, with
    // the overflow in the cell's scroll window.
    setViewportHeight(900)
    const { wrapper, svg } = mkPortrait()
    stampSvgFigure(wrapper)

    expect(parseFloat(svg.style.width)).toBeCloseTo(2 * PORTRAIT_W, 0)
    expect(parseFloat(svg.style.width)).toBeLessThan(800)
    expect(wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(true)
  })

  it('the caps track the viewport height: window cap binds short, upscale cap binds tall', () => {
    // At 600px the 5-window cap (5 × 450 × ar = 575px) binds before the
    // 2×-natural cap (604px); at 4000px the window cap clears and the upscale
    // cap (604px) binds — a portrait diagram never reaches the full column,
    // by design.
    setViewportHeight(600)
    const a = mkPortrait()
    stampSvgFigure(a.wrapper)
    const short = parseFloat(a.svg.style.width)
    document.body.innerHTML = ''

    setViewportHeight(4000)
    const b = mkPortrait()
    stampSvgFigure(b.wrapper)
    const tall = parseFloat(b.svg.style.width)

    expect(short).toBeCloseTo(600 * 0.75 * 5 * AR, 0)
    expect(tall).toBeCloseTo(2 * PORTRAIT_W, 0)
    // Short viewport: 2250px of content in a 450px window — scrolls. Very tall
    // viewport: 2363px of content against a 3000px budget — fits WHOLE, no
    // scroll window needed.
    expect(a.wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(true)
    expect(b.wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(false)
  })

  it('yields to the column for a tall diagram in a narrow column', () => {
    // jsdom's scrollbar probe measures 0 (no layout), so the allowance is a
    // no-op here and the width is exactly the column.
    setViewportHeight(900)
    const { wrapper, svg } = mkPortrait()
    Object.defineProperty(wrapper.parentElement!, 'getBoundingClientRect', {
      value: () => ({ width: 260, height: 0, top: 0, left: 0, right: 260, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })
    stampSvgFigure(wrapper)

    expect(parseFloat(svg.style.width)).toBe(260)
    expect(wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(true)
  })

  it('never exceeds the column for a tall diagram on a very tall viewport', () => {
    setViewportHeight(4000)
    const { wrapper, svg } = mkPortrait()
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBeLessThanOrEqual(800)
  })

  it('does not stamp the scroll window on a diagram that fits the budget', () => {
    // A landscape flowchart's natural height is far below 60dvh: no window,
    // and the width contract is unchanged from before.
    setViewportHeight(900)
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 1600 70')
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 0, top: 0, left: 0, right: 800, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })
    stampSvgFigure(wrapper)

    expect(parseFloat(svg.style.width)).toBe(800)
    expect(wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(false)
  })

  it('does not stamp the scroll window on a raster image, even a tall one', () => {
    // A raster <img> keeps its own max-height cap and the lightbox; the scroll
    // window is vector-only (`isVectorMedia`). Its width still comes from the
    // last-resort branch (an img has no viewBox), which is the budget-derived
    // width — i.e. the img path is untouched by this change.
    setViewportHeight(900)
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper'
    const wrap = document.createElement('span')
    wrap.className = 'lightbox-img-wrap'
    const img = document.createElement('img')
    img.className = 'lightbox-img'
    img.setAttribute('src', 'chart.svg')
    withNaturalSize(img, PORTRAIT_W, PORTRAIT_H)
    wrap.appendChild(img)
    wrapper.appendChild(wrap)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 0, top: 0, left: 0, right: 800, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })
    stampSvgFigure(wrapper)

    expect(parseFloat(img.style.width)).toBeCloseTo(900 * 0.75 * (PORTRAIT_W / PORTRAIT_H), 0)
    expect(wrapper.classList.contains(SVG_SCROLL_CLASS)).toBe(false)
  })

  it('keeps the frame hugging the media (no empty gutters at rest)', () => {
    // At rest the figure is shrink-to-fit around the media's resolved width, so
    // the frame and the artwork have the SAME width and there are no empty
    // bands. jsdom cannot lay this out, so the contract asserted here is the
    // input to it — the svg carries a definite pixel width equal to the capped
    // fill width, and the CSS that makes the frame hug it is pinned by
    // MarkdownPreviewSvgFit.css.test.ts.
    setViewportHeight(900)
    const { wrapper, svg } = mkPortrait()
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBeCloseTo(2 * PORTRAIT_W, 0)
  })

  it('uses the same window budgets the stylesheet reserves, per surface', () => {
    // The scroll DECISION compares the artwork's natural height against the
    // budget, and the HEIGHT of the window itself is enforced by
    // `media-block.css` (`.svg-scroll` cell) through the `--media-window`
    // custom property. Two independent literals drift: a stylesheet window
    // smaller than the JS budget leaves stamped figures that show no overflow
    // (dead scroll class), and a larger one lets tall diagrams dominate the
    // viewport uncropped. The budget is PER SURFACE now (documents 75dvh,
    // chat 60dvh — a global 75dvh was tried and reverted for phone chat), so
    // this pins BOTH pairs: the `:root` default ↔ MEDIA_HEIGHT_FRAC_DOC, and
    // the `.chat-message` override ↔ MEDIA_HEIGHT_FRAC.
    const css = readWebFile('css/media-block.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const defs = Array.from(css.matchAll(/--media-window:\s*(\d+(?:\.\d+)?)dvh/g))
    expect(defs.length, 'the stylesheet must define --media-window twice (default + chat)')
      .toBe(2)
    const docFrac = Number(defs[0]![1]) / 100
    const chatFrac = Number(defs[1]![1]) / 100

    expect(MEDIA_HEIGHT_FRAC_DOC).toBeCloseTo(docFrac, 5)
    expect(MEDIA_HEIGHT_FRAC_DOC).toBe(0.75)
    expect(MEDIA_HEIGHT_FRAC).toBeCloseTo(chatFrac, 5)
    expect(MEDIA_HEIGHT_FRAC).toBe(0.6)
    // And the definitions sit in the right scopes: the default on :root, the
    // chat override on the chat wrapper mediaHeightFrac() looks for.
    expect(css).toMatch(/:root\s*\{[^}]*--media-window:\s*75dvh/)
    expect(css).toMatch(/\.chat-message\s*\{[^}]*--media-window:\s*60dvh/)
  })

  it('gives a chat-bubble figure the shorter 60dvh budget, a document figure 75dvh', () => {
    // The per-surface split in one picture: the SAME square diagram, stamped
    // inside `.chat-message` and outside it. Chat keeps the phone-safe
    // budget (a global 75dvh was tried and reverted — the bubble plus header,
    // input bar and dock left the message off-screen); documents get the
    // taller window the tablet follow-up asked for. Detection is structural
    // (`closest('.chat-message')`), exactly like the stylesheet override.
    setViewportHeight(900)
    const mkSquare = (host: HTMLElement) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'image-block-wrapper'
      const cell = document.createElement('div')
      cell.className = 'mermaid'
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 400 400')
      svg.style.maxWidth = '400px'
      cell.appendChild(svg)
      wrapper.appendChild(cell)
      const column = document.createElement('div')
      column.appendChild(wrapper)
      host.appendChild(column)
      document.body.appendChild(host)
      Object.defineProperty(column, 'getBoundingClientRect', {
        value: () => ({ width: 800, height: 0, top: 0, left: 0, right: 800, bottom: 0, x: 0, y: 0, toJSON() {} }),
        configurable: true,
      })
      return { wrapper, svg }
    }

    const chatHost = document.createElement('div')
    chatHost.className = 'chat-message'
    const chat = mkSquare(chatHost)
    stampSvgFigure(chat.wrapper)
    // Chat: complete zone at 0.6 × 900 = 540 (the pre-split global budget).
    expect(parseFloat(chat.svg.style.width)).toBe(540)

    const doc = mkSquare(document.createElement('div'))
    stampSvgFigure(doc.wrapper)
    // Document: the taller window — 0.75 × 900 = 675.
    expect(parseFloat(doc.svg.style.width)).toBe(675)
  })
})

/**
 * The width the media may take must be the column's CONTENT box, in CSS
 * pixels — not its `getBoundingClientRect().width`.
 *
 * #570 follow-up (reported on a phone): every diagram showed a nearly-full
 * horizontal scrollbar. The media had been sized to the column's BORDER box,
 * so it overflowed the content box by the column's padding plus the figure's
 * border, and `.mermaid { overflow-x: auto }` drew the bar. Two independent
 * errors stack in that same measurement:
 *
 *   1. the rect is the border box (padding included) — 32px of padding plus a
 *      2px figure border on a 390px phone;
 *   2. the rect is scaled by the appearance setting's `html { zoom }`, while
 *      `style.width` is a CSS px value — at zoom 1.25 the overflow tripled.
 *
 * `clientWidth` answers both (content+padding box, unscaled), so the contract
 * asserted here is: subtract the column's padding and the figure's borders.
 */

/**
 * The zone widths derive from the UI-SCALED natural size, so they follow the
 * interface zoom ("界面缩放") — at 125% the labels read at the same relative
 * size against the scaled-up body text, whatever zone a diagram lands in.
 */
describe('ui-scale following (zone widths × applied scale)', () => {
  const mkSvg = (inlineMax: number, vbW: number, vbH: number) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
    svg.style.maxWidth = `${inlineMax}px`
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 0, top: 0, left: 0, right: 800, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })
    return { wrapper, svg, column }
  }

  const originalInnerHeight = window.innerHeight
  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.style.removeProperty('--ui-scale')
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  it('widens the zones with the interface zoom', () => {
    // A portrait diagram in the FILL zone at a 900px viewport: the 2×-natural
    // cap (604) binds at scale 1; at 125% the upscale cap widens to 755 and
    // now binds itself (the 5-window cap cleared to 862). Either way the
    // width GROWS with the reader's text size — that is the property that
    // matters.
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    document.documentElement.style.setProperty('--ui-scale', '1.25')
    const a = mkSvg(302, 302, 1182)
    stampSvgFigure(a.wrapper)
    const w125 = parseFloat(a.svg.style.width)
    document.body.innerHTML = ''

    document.documentElement.style.removeProperty('--ui-scale')
    const b = mkSvg(302, 302, 1182)
    stampSvgFigure(b.wrapper)
    const w100 = parseFloat(b.svg.style.width)

    expect(w100).toBeCloseTo(2 * 302, 0)
    expect(w125).toBeCloseTo(Math.min(2 * 302 * 1.25, 5 * 675 * (302 / 1182)), 0)
    expect(w125).toBeGreaterThan(w100)
  })

  it('re-stamps every figure when the scale changes at runtime', async () => {
    // Moving the interface-zoom slider fires UI_SCALE_EVENT (never `resize`);
    // the zone widths depend on the scale, so ALL of them must re-stamp.
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb)
      return callbacks.length
    })
    const settle = () => new Promise((r) => setTimeout(r, 0))
    const drain = () => { for (const cb of callbacks.splice(0)) cb(0) }

    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    const { wrapper, svg } = mkSvg(302, 302, 1182)
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBeCloseTo(2 * 302, 0)

    const stop = installSvgMediaAutoFit()
    try {
      await settle()
      drain()

      document.documentElement.style.setProperty('--ui-scale', '1.25')
      window.dispatchEvent(new CustomEvent('clawbench-ui-scale-change'))
      await settle()
      drain()

      expect(parseFloat(svg.style.width))
        .toBeCloseTo(Math.min(2 * 302 * 1.25, 5 * 675 * (302 / 1182)), 0)
    } finally {
      stop()
      vi.restoreAllMocks()
    }
  })
})

describe('available column width (content box, unscaled)', () => {
  const mk = (opts: { clientWidth: number; padX?: number; borderX?: number }) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper'
    if (opts.borderX) wrapper.style.border = `${opts.borderX / 2}px solid #000`
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    // Wide enough that the column clamp is the only thing that can apply.
    svg.setAttribute('viewBox', '0 0 4000 100')
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    if (opts.padX) column.style.padding = `0 ${opts.padX / 2}px`
    column.appendChild(wrapper)
    document.body.appendChild(column)

    Object.defineProperty(column, 'clientWidth', { value: opts.clientWidth, configurable: true })
    // The rect deliberately reports the BORDER box at the same nominal size —
    // the bug was reading this number instead of the content box.
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({
        width: opts.clientWidth, height: 0, top: 0, left: 0,
        right: opts.clientWidth, bottom: 0, x: 0, y: 0, toJSON() {},
      }),
      configurable: true,
    })
    return { wrapper, svg }
  }

  afterEach(() => { document.body.innerHTML = '' })

  it('subtracts the column padding and the figure border', () => {
    // 390px column, 16px padding each side, 1px figure border each side.
    const { wrapper, svg } = mk({ clientWidth: 390, padX: 32, borderX: 2 })
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(356)
  })

  it('does not subtract anything when the column has no padding', () => {
    const { wrapper, svg } = mk({ clientWidth: 800 })
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(800)
  })

  it('writes nothing (rather than a negative width) for a column narrower than its padding', () => {
    // `availableColumnWidth` clamps at 0, so the width computation yields 0 and
    // the writer bails out. The important part is that no inline `-22px` is
    // emitted: the browser would reject it and leave the PREVIOUS value in
    // place, which looks like a frozen diagram.
    const { wrapper, svg } = mk({ clientWidth: 10, padX: 32, borderX: 2 })
    stampSvgFigure(wrapper)
    expect(svg.style.width).toBe('')
  })

  it('falls back to the rect when the column reports no client width', () => {
    // Detached or `display: none` columns report 0 — the figure must keep the
    // previous behaviour rather than collapsing to zero.
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 4000 100')
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    Object.defineProperty(column, 'clientWidth', { value: 0, configurable: true })
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({ width: 640, height: 0, top: 0, left: 0, right: 640, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })

    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(640)
  })
})

describe('responsive refit (svgMediaFit)', () => {
  const mk = (vbW: number, vbH: number) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper svg-fit'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    let colW = 800
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => ({ width: colW, height: 0, top: 0, left: 0, right: colW, bottom: 0, x: 0, y: 0, toJSON() {} }),
      configurable: true,
    })
    return { wrapper, svg, setColumnWidth: (w: number) => { colW = w } }
  }

  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  it('re-measures against the CURRENT column on refit', () => {
    // The width is written as a resolved pixel value (that is what breaks the
    // figure↔media cycle), so it is frozen at the moment it was written. Without
    // a refit, collapsing a side panel left the diagram at its old width.
    const { wrapper, svg, setColumnWidth } = mk(1600, 70)
    stampSvgFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(800)

    setColumnWidth(500)
    refitFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(500)

    setColumnWidth(1200)
    refitFigure(wrapper)
    expect(parseFloat(svg.style.width)).toBe(1200)
  })

  it('does not fight the zoom while a figure is active', () => {
    // `inlineZoom` owns the media size while zoomed; writing here would
    // overwrite the zoomed size on every mutation tick.
    const { wrapper, svg, setColumnWidth } = mk(1600, 70)
    stampSvgFigure(wrapper)
    wrapper.classList.add('is-zooming')
    svg.style.width = '3000px'

    setColumnWidth(400)
    refitFigure(wrapper)

    expect(svg.style.width).toBe('3000px')
  })

  it('ignores figures that were never stamped', () => {
    const { wrapper, svg } = mk(1600, 70)
    wrapper.classList.remove('svg-fit')
    svg.style.width = '123px'
    refitFigure(wrapper)
    expect(svg.style.width).toBe('123px')
  })
})

/**
 * `installSvgMediaAutoFit` wires the two signals that keep a stamped figure's
 * frozen pixel width correct: a ResizeObserver on each column, and a
 * MutationObserver for newly rendered figures.
 *
 * The defect these cases pin: the mutation path used to re-measure EVERY figure
 * in the document on every mutation. The chat transcript replaces innerHTML on
 * each streaming frame, so a session with a dozen diagrams paid a full-document
 * forced synchronous layout per frame — while only the newly added figure
 * actually needed a first measurement.
 */
describe('installSvgMediaAutoFit — scope of a refit pass', () => {
  /**
   * A stamped figure whose column records each measurement.
   *
   * refitFigure measures the COLUMN (the figure's parent), so the probe has to
   * sit there — a probe on the wrapper would never fire.
   */
  function mkFigure(vbW: number, vbH: number, colW = 800) {
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper svg-fit'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    const measured: number[] = []
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => {
        measured.push(1)
        return { width: colW, height: 0, top: 0, left: 0, right: colW, bottom: 0, x: 0, y: 0, toJSON() {} }
      },
      configurable: true,
    })
    return { wrapper, svg, column, measured }
  }

  /**
   * Capture rAF callbacks instead of running them, so a test can decide when a
   * coalesced pass executes. Returns a function that drains them.
   */
  function captureFrames() {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb)
      return callbacks.length
    })
    return () => {
      const queued = callbacks.splice(0)
      for (const cb of queued) cb(0)
    }
  }

  /** MutationObserver delivers as a microtask; give it a turn. */
  const settle = () => new Promise((r) => setTimeout(r, 0))

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function stubResizeObserver() {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
  }

  it('re-measures only the figures a mutation added', async () => {
    stubResizeObserver()
    const runFrames = captureFrames()

    const existing = mkFigure(1600, 70)
    stampSvgFigure(existing.wrapper)

    const stop = installSvgMediaAutoFit()
    await settle()
    runFrames()
    existing.measured.length = 0

    // A streaming render appends a NEW figure; the old one is untouched.
    const fresh = mkFigure(400, 70)
    stampSvgFigure(fresh.wrapper)
    await settle()
    runFrames()

    expect(existing.measured.length, 'the untouched figure must not be re-measured').toBe(0)
    expect(fresh.measured.length, 'the added figure must be measured').toBeGreaterThan(0)

    stop()
  })

  it('re-measures every figure on a viewport resize', async () => {
    stubResizeObserver()
    const runFrames = captureFrames()

    const a = mkFigure(1600, 70)
    const b = mkFigure(1600, 70)
    stampSvgFigure(a.wrapper)
    stampSvgFigure(b.wrapper)

    const stop = installSvgMediaAutoFit()
    await settle()
    runFrames()
    a.measured.length = 0
    b.measured.length = 0

    // The 60dvh height budget changes with the viewport, so every figure needs
    // a new width — not just the ones the observer happened to name.
    window.dispatchEvent(new Event('resize'))
    runFrames()

    expect(a.measured.length).toBeGreaterThan(0)
    expect(b.measured.length).toBeGreaterThan(0)

    stop()
  })

  it('does nothing on a mutation that adds no figure', async () => {
    stubResizeObserver()
    const runFrames = captureFrames()

    const existing = mkFigure(1600, 70)
    stampSvgFigure(existing.wrapper)

    const stop = installSvgMediaAutoFit()
    await settle()
    runFrames()
    existing.measured.length = 0

    // The common streaming case: text is appended into an existing node.
    const para = document.createElement('p')
    para.textContent = 'streaming text'
    document.body.appendChild(para)
    await settle()
    runFrames()

    expect(existing.measured.length, 'a text-only mutation must not trigger a refit').toBe(0)

    stop()
  })

  it('stops observing after teardown', async () => {
    stubResizeObserver()
    const runFrames = captureFrames()

    const fig = mkFigure(1600, 70)
    stampSvgFigure(fig.wrapper)

    const stop = installSvgMediaAutoFit()
    await settle()
    runFrames()
    fig.measured.length = 0
    stop()

    window.dispatchEvent(new Event('resize'))
    runFrames()

    expect(fig.measured.length).toBe(0)
  })
})

/**
 * A mermaid re-render must re-measure the figure.
 *
 * mermaid.ts re-renders by replacing the CONTENTS of the existing `.mermaid`
 * container (`container.innerHTML = result.svg`) on every theme / font change.
 * The `.image-block-wrapper` is untouched, so a mutation handler that keys on
 * "a wrapper was added" sees nothing to do — and the diagram keeps the inline px
 * width computed for the OLD theme/font until the next window resize.
 */
describe('installSvgMediaAutoFit — figure content replaced in place', () => {
  function mkMermaidFigure(colW = 800) {
    const wrapper = document.createElement('div')
    wrapper.className = 'image-block-wrapper svg-fit'
    const cell = document.createElement('div')
    cell.className = 'mermaid'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 1600 70')
    cell.appendChild(svg)
    wrapper.appendChild(cell)
    const column = document.createElement('div')
    column.appendChild(wrapper)
    document.body.appendChild(column)
    const measured: number[] = []
    Object.defineProperty(column, 'getBoundingClientRect', {
      value: () => {
        measured.push(1)
        return { width: colW, height: 0, top: 0, left: 0, right: colW, bottom: 0, x: 0, y: 0, toJSON() {} }
      },
      configurable: true,
    })
    return { wrapper, cell, measured }
  }

  function captureFrames() {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb)
      return callbacks.length
    })
    return () => {
      for (const cb of callbacks.splice(0)) cb(0)
    }
  }

  const settle = () => new Promise((r) => setTimeout(r, 0))

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('re-measures when a mermaid re-render replaces the svg inside the same wrapper', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    const runFrames = captureFrames()

    const fig = mkMermaidFigure()
    stampSvgFigure(fig.wrapper)

    const stop = installSvgMediaAutoFit()
    await settle()
    runFrames()
    fig.measured.length = 0

    // Exactly what mermaid.ts does on a theme change: the container stays, its
    // children are swapped for a freshly rendered svg.
    const fresh = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    fresh.setAttribute('viewBox', '0 0 1600 70')
    fig.cell.innerHTML = ''
    fig.cell.appendChild(fresh)

    await settle()
    runFrames()

    expect(
      fig.measured.length,
      'a re-rendered diagram must be re-measured; otherwise it keeps the old theme/font width',
    ).toBeGreaterThan(0)

    stop()
  })
})
