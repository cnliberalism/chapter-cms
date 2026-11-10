'use strict';
// Visual checks (F6): renders the block gallery and the demo pages at desktop and phone widths in headless Chromium
// and compares each screenshot with the baseline PNG in test/visual/baseline/. Catches layout breakage that the
// unit tests can't see, like a block overflowing on phones or a CSS change that moves the menu.
//   npm run test:visual                        compare against the baselines
//   UPDATE_SNAPSHOTS=1 npm run test:visual     accept the current look as the new baselines
// Needs Playwright with Chromium (npm i -D playwright, or NODE_PATH pointing at a global install). Without it the
// tests are skipped. Web fonts are blocked so the result doesn't depend on the network; fallback fonts differ between
// machines, so make baselines on the machine (or CI image) that checks them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { setup, seed } = require('../helpers');
const { DESIGNS } = require('../../lib/theme');

let chromium = null;
for (const m of ['playwright', '@playwright/test']) { try { chromium = require(m).chromium; break; } catch { /* try the next */ } }

const DIR = __dirname, BASE = path.join(DIR, 'baseline'), ACTUAL = path.join(DIR, 'actual');
const UPDATE = !!process.env.UPDATE_SNAPSHOTS;
const NOW = new Date('2026-10-01T12:00:00Z'); // fixed, so upcoming events and announcement end dates don't drift
const MAX_DIFF = 0.003; // share of pixels allowed to differ (anti-aliasing noise)

// Minimal PNG reader for Chromium's screenshots: 8-bit RGB or RGBA, not interlaced.
function readPng(buf) {
  let p = 8, w = 0, h = 0, type = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12]) throw new Error('unsupported PNG'); }
    if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error('unsupported PNG color type ' + type);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0, b = y ? out[row - stride + x] : 0, c = x >= bpp && y ? out[row - stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[row + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}
function diffShare(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let n = 0;
  for (let i = 0, j = 0; i < a.px.length; i += a.bpp, j += b.bpp) {
    if (Math.abs(a.px[i] - b.px[j]) > 24 || Math.abs(a.px[i + 1] - b.px[j + 1]) > 24 || Math.abs(a.px[i + 2] - b.px[j + 2]) > 24) n++;
  }
  return n / (a.w * a.h);
}

// Pages to check: every block with sample content, plus demo pages as chapter leads see them, rendered by the CMS
// itself from the demo data so saved sections, item lists and the chapter's look all come through.
const css = fs.readFileSync(path.join(__dirname, '../../static/site.css'), 'utf8');
const { cms } = setup({ at: NOW.toISOString() });
const inline = (h) => h.replace('<link rel="stylesheet" href="/static/site.css">', `<style>${css}</style>`);
const live = (p) => async () => inline((await cms.renderLive('demo', p)).html);
const PAGES = {
  gallery: async () => inline(await cms.gallery('demo')),
  home: live(''),
  about: live('about'),
  event: live('events/voter-registration-drive'),
  people: live('people'),
};
const SIZES = { desktop: { width: 1200, height: 800 }, phone: { width: 390, height: 844 } };

test('visual: pages match their baselines', { skip: chromium ? false : 'Playwright is not installed' }, async (t) => {
  const browser = await chromium.launch();
  try {
    fs.mkdirSync(BASE, { recursive: true });
    for (const [size, viewport] of Object.entries(SIZES)) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      await ctx.route(/^https?:/, (r) => r.abort()); // no web fonts or images from the network
      const page = await ctx.newPage();
      for (const [name, make] of Object.entries(PAGES)) {
        await t.test(`${name} (${size})`, async () => {
          await page.setContent(await make(), { waitUntil: 'load' });
          const shot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
          const file = path.join(BASE, `${name}-${size}.png`);
          // Phones must never scroll sideways.
          const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          assert.ok(sideways <= 0, `${name} scrolls sideways by ${sideways}px at ${viewport.width}px wide`);
          if (UPDATE || !fs.existsSync(file)) { fs.writeFileSync(file, shot); return; }
          const want = readPng(fs.readFileSync(file)), got = readPng(shot), share = diffShare(want, got);
          if (share > MAX_DIFF) {
            fs.mkdirSync(ACTUAL, { recursive: true });
            fs.writeFileSync(path.join(ACTUAL, `${name}-${size}.png`), shot);
          }
          const what = want.w !== got.w || want.h !== got.h ? `changed size from ${want.w}x${want.h} to ${got.w}x${got.h}` : `${(share * 100).toFixed(2)}% of pixels changed`;
          assert.ok(share <= MAX_DIFF, `${name} at ${size} looks different from the baseline (${what}). ` +
            `Compare test/visual/actual/${name}-${size}.png with the baseline; if the change is intended, run UPDATE_SNAPSHOTS=1 npm run test:visual.`);
        });
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
});

// The baselines above cover the demo chapter's design. Every design must still fit a phone: all blocks, the home
// page and item pages, as visitors see them and inside the editor (where each section sits in a wrapper with an
// "add section" bar before it). Designs listed in LONG_NAMES_FIT are also checked with a long chapter name and long
// words in headings, which Master Plan and Riso Zine don't fully handle yet.
const LONG_NAMES_FIT = ['skyline', 'blockparty', 'midrise'];
test('visual: no design scrolls sideways on a phone', { skip: chromium ? false : 'Playwright is not installed' }, async (t) => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: SIZES.phone, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await ctx.route(/^https?:/, (r) => r.abort());
    const page = await ctx.newPage();
    const frame = `<style>${fs.readFileSync(path.join(__dirname, '../../admin/frame.css'), 'utf8')}</style>`;
    const check = async (style, long) => {
      const data = seed(), d = data.demo;
      d.site.theme = { ...d.site.theme, style };
      if (long) {
        d.site.name = 'Northwest Arkansas and Fayetteville Metropolitan Chapter';
        d['page/home'].blocks[0].props.heading = 'Transportation infrastructure.\nNeighborhood revitalization.';
        d['item/events/voter-registration-drive'].title = 'Transportation Infrastructure Subcommittee Listening Session';
        d['item/people/alex-rivera'].name = 'Alexandria Montgomery-Featherstonehaugh';
      }
      const c = setup({ at: NOW.toISOString(), data }).cms;
      const pages = {
        gallery: await c.gallery('demo'),
        home: (await c.renderLive('demo', '')).html,
        about: (await c.renderLive('demo', 'about')).html,
        event: (await c.renderLive('demo', 'events/voter-registration-drive')).html,
        person: (await c.renderLive('demo', 'people/alex-rivera')).html,
        'home in the editor': await c.renderPreview('demo', { ...d['page/home'], page: 'home', edit: true }, frame),
      };
      for (const [name, html] of Object.entries(pages)) {
        await page.setContent(inline(html), { waitUntil: 'load' });
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(sideways <= 0, `${style}: ${name}${long ? ' with long names' : ''} scrolls sideways by ${sideways}px at ${SIZES.phone.width}px wide`);
      }
    };
    for (const style of Object.keys(DESIGNS)) {
      await t.test(style, async () => { await check(style, false); if (LONG_NAMES_FIT.includes(style)) await check(style, true); });
    }
    await ctx.close();
  } finally { await browser.close(); }
});

test('visual: PNG reader decodes what it compares', () => {
  // 2x1 RGB image, one red and one blue pixel, built by hand (filter 0).
  const chunk = (kind, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(kind, 4, 'ascii'); data.copy(b, 8); return b; };
  const ihdr = Buffer.from([0, 0, 0, 2, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
  const img = readPng(png);
  assert.deepStrictEqual([img.w, img.h, [...img.px]], [2, 1, [255, 0, 0, 0, 0, 255]]);
  assert.strictEqual(diffShare(img, img), 0);
});
