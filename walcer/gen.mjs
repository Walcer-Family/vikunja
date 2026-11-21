// Regenerates every Walcer brand asset at the same filename and pixel size
// as the upstream Vikunja asset it replaces. Run from this folder:
//   node gen.mjs [font.ttf]   (default: fonts/PlayfairDisplay.ttf)
// Needs python3 + fonttools (for wordmark.py) and Playwright's Chromium.
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const FONT = process.argv[2] || 'fonts/PlayfairDisplay.ttf'  // serif W + wordmark (OFL)
const BLUE = '#1973ff'      // Vikunja's primary colour, unchanged
const INK = '#2c3844'       // upstream wordmark text colour (email)
const NAME = 'Tasks'
const FE = '../frontend'

// The monogram: the real "W" glyph from FONT, fitted to a 100x100 box.
const glyphD = execFileSync('python3', ['glyph.py', FONT, 'W', '700']).toString().trim()
const W = () => `<path fill="#fff" d="${glyphD}"/>`

// Same strokes, recoloured: for monochrome badge / pinned tab / watermarks.
const mono = (colour) => W().replaceAll('#fff', colour)

// tile(x,y,size,{rounded,inset}) -> SVG group. inset shrinks the W (maskable safe zone).
const tile = (x, y, s, { r = 22, inset = 0, bg = BLUE } = {}) => {
  const k = s / 100, i = inset
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect width="100" height="100" rx="${r}" fill="${bg}"/>` +
    `<g transform="translate(${i} ${i}) scale(${(100 - 2 * i) / 100})">${W(bg)}</g></g>`
}
const svg = (w, h, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>`

const wm = JSON.parse(execFileSync('python3', ['wordmark.py', NAME, '700', FONT]).toString())
// wordmark(x, yTop, capPx, fill) -> path scaled so cap height = capPx
const wordmark = (x, y, cap, fill) => {
  const k = cap / wm.cap
  return { w: wm.width * k, el: `<path transform="translate(${x} ${y}) scale(${k})" fill="${fill}" d="${wm.d}"/>` }
}

// ---------- vector assets (same viewBox as upstream) ----------
const out = {}
{ // header/login logo 872.6 x 256.8, text follows --logo-text-color via currentColor
  const t = wordmark(292, 128.4 - 70, 140, 'currentColor')
  const full = svg(872.6, 256.8, `<title>${NAME}</title>${tile(0, 0.4, 256)}${t.el}`, ' role="img"')
  out[`${FE}/src/assets/logo-full.svg`] = full
  out[`${FE}/src/assets/logo-full-pride.svg`] = full.replace('viewBox="0 0 872.6 256.8"', 'viewBox="0 0 872.6 256.8"')
}
out[`${FE}/src/assets/logo.svg`] = svg(256, 256, tile(0, 0, 256))
// login page corner art (was the peeking llama): faint tile, bottom-left
out[`${FE}/src/assets/llama.svg`] = svg(145.4, 204.5, `<g opacity=".12">${tile(12, 72, 120)}</g>`)
// "all done" empty state (was the cool llama)
out[`${FE}/src/assets/llama-cool.svg`] = svg(300, 312.6, tile(10, 16.3, 280, { r: 50 }))
// Safari pinned tab: single-colour silhouette
out[`${FE}/public/images/icons/safari-pinned-tab.svg`] = svg(16, 16, `<g transform="scale(.16)">${mono('#000')}</g>`)

for (const [p, s] of Object.entries(out)) writeFileSync(p, s)

// ---------- raster assets, rendered in Chromium ----------
const raster = [] // [path, w, h, svgString, format]
const icons = `${FE}/public/images/icons`
const square = (s, inset = 6) => svg(s, s, tile(0, 0, s, { r: 0, inset }))
const rounded = (s) => svg(s, s, tile(0, 0, s, { r: 22, inset: 2 }))
for (const s of [60, 76, 120, 152, 180]) raster.push([`${icons}/apple-touch-icon-${s}x${s}.png`, s, s, square(s)])
raster.push([`${icons}/apple-touch-icon.png`, 180, 180, square(180)])
raster.push([`${icons}/android-chrome-192x192.png`, 192, 192, rounded(192)])
raster.push([`${icons}/android-chrome-512x512.png`, 512, 512, rounded(512)])
raster.push([`${icons}/icon-maskable.png`, 1024, 1024, square(1024, 18)])
raster.push([`${icons}/msapplication-icon-144x144.png`, 144, 144, square(144)])
raster.push([`${icons}/mstile-150x150.png`, 270, 270, square(270, 14)])
raster.push([`${icons}/favicon-16x16.png`, 16, 16, rounded(16)])
raster.push([`${icons}/favicon-32x32.png`, 32, 32, rounded(32)])
raster.push([`${icons}/favicon-tracking-32x32.png`, 32, 32, svg(32, 32, tile(0, 0, 32, { inset: 2 }) + '<circle cx="26" cy="26" r="6" fill="#ff4136" stroke="#fff" stroke-width="2"/>')])
raster.push([`${icons}/badge-monochrome.png`, 128, 128, svg(128, 128, `<g transform="scale(1.28)">${mono('#fff')}</g>`)])
raster.push(['/tmp/walcer-favicon-256.png', 256, 256, rounded(256)])
{ // email header 250 x 75
  const t = wordmark(88, 37.5 - 17.5, 35, INK)
  raster.push(['../pkg/notifications/logo.png', 250, 75, svg(250, 75, tile(0, 0, 75) + t.el)])
}
// backgrounds (JPEG): loading screen + login side image
const bg = (w, h, wm) => svg(w, h,
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f80ff"/><stop offset="1" stop-color="#0b3fa8"/></linearGradient></defs>` +
  `<rect width="${w}" height="${h}" fill="url(#g)"/><g opacity=".10" transform="translate(${wm.x} ${wm.y}) scale(${wm.s / 100})">${mono('#fff')}</g>`)
raster.push([`${FE}/src/assets/llama-nightscape.jpg`, 1920, 1920, bg(1920, 1920, { x: 360, y: 360, s: 1200 }), 'jpeg'])
raster.push([`${FE}/src/assets/no-auth-image.jpg`, 900, 1184, bg(900, 1184, { x: 100, y: 240, s: 700 }), 'jpeg'])

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [p, w, h, s, fmt = 'png'] of raster) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`)
  await page.screenshot({ path: p, type: fmt, omitBackground: fmt === 'png', quality: fmt === 'jpeg' ? 88 : undefined, clip: { x: 0, y: 0, width: w, height: h } })
}
await browser.close()
// favicon.ico (multi-size) from the 256px render
execFileSync('convert', ['/tmp/walcer-favicon-256.png', '-define', 'icon:auto-resize=256,64,48,32,16', `${FE}/public/favicon.ico`])
console.log(`done: ${Object.keys(out).length} SVGs, ${raster.length + 1} rasters, font ${FONT}`)
