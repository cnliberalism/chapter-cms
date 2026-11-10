'use strict';
// Theme engine (T1, T2). Pages store content and option names only; how they look comes from here and static/site.css:
//   style     the design (see DESIGNS below); switching it restyles every page without touching content
//   palette   an approved national colour set (or custom colours, when national allows them for the chapter)
//   fonts     an approved font pairing
// Every colour that text sits on is checked for contrast, and derived text colours are darkened until they pass.
const { esc } = require('./text');

const PAPER = '#FDFBE9', INK = '#22293f';
const PALETTES = [
  { id: 'rose', name: 'Rose', primary: '#2C3659', accent: '#C23B4F' },
  { id: 'cnl', name: 'CNL red', primary: '#2C3659', accent: '#9F3C39' },
  { id: 'teal', name: 'Teal', primary: '#2C3659', accent: '#00ABBF' },
  { id: 'sky', name: 'Sky', primary: '#2C3659', accent: '#74C0EB' },
  { id: 'coral', name: 'Coral', primary: '#2C3659', accent: '#F7986E' },
  { id: 'green', name: 'Green', primary: '#2C3659', accent: '#3E7B4F' },
];
const FONTS = [
  { id: 'archivo', name: 'Archivo and Domine', sign: '"Archivo",sans-serif', body: '"Domine",Georgia,serif', css: 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Domine:wght@400..700&display=swap' },
  { id: 'civic', name: 'Archivo and Source Serif', sign: '"Archivo",sans-serif', body: '"Source Serif 4",Georgia,serif', css: 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Source+Serif+4:opsz,wght@8..60,400..700&display=swap' },
  { id: 'system', name: 'System fonts (fastest to load)', sign: 'system-ui,-apple-system,"Segoe UI",sans-serif', body: 'system-ui,-apple-system,"Segoe UI",sans-serif', css: '' },
];
// Older settings used other ids for the same pairing.
const FONT_ALIAS = { yard: 'archivo' };
const fontId = (id) => FONT_ALIAS[id] || id;
// The designs. ground: the surface most text sits on (derived text colours are checked against it); extra: a font the
// design needs whatever pairing is picked (Riso Zine's hand-lettered notes, the display faces of the three below).
// Master Plan and Riso Zine come from the CNL Chapter Sites design-directions canvas.
const gfont = (family) => `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
const DESIGNS = {
  masterplan: { name: 'Master Plan', hint: 'Clean planning sheets on a light grid, with a map in the hero.', ground: '#f3f4ef' },
  riso: { name: 'Riso Zine', hint: 'A bold, hand-made zine: condensed headlines, taped photos, marker notes.', ground: '#f3f1e8', extra: gfont('Permanent+Marker') },
  skyline: { name: 'Skyline', hint: 'Art Deco city at night: a stepped tower and a sunrise in your chapter colour, tall centred lettering.', ground: '#f5f0e4', extra: gfont('Josefin+Sans:wght@300..700') },
  blockparty: { name: 'Block Party', hint: 'A city built from circles, arches and triangles, with bunting overhead. Bright, rounded and friendly.', ground: '#f7f3e7', extra: gfont('Jost:wght@500..900') },
  midrise: { name: 'Mid-Rise', hint: 'The site is a building in your chapter colour: every section is a floor, from the rooftop sign to the street.', ground: '#fbf6ea', extra: gfont('Fraunces:opsz,wght,SOFT@9..144,500..900,100') },
};
const STYLES = Object.fromEntries(Object.entries(DESIGNS).map(([k, d]) => [k, d.name]));
const DEFAULT_STYLE = 'masterplan';
// Sites saved before these designs ("yard", "plain") get the default design.
const styleId = (s) => (DESIGNS[s] ? s : DEFAULT_STYLE);

const hexOk = (c, d) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c || '') ? c : d);
const rgb = (c) => { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join(''); const n = parseInt(c, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (c) => { const v = rgb(c).map((x) => { x /= 255; return x > 0.03928 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
const readable = (c, bg, ink) => { for (let i = 0; i < 14 && contrast(c, bg) < 4.6; i++) c = mix(c, ink, 0.16); return c; };
const onColor = (c) => (contrast(c, '#ffffff') >= contrast(c, INK) ? '#ffffff' : INK);

// Contrast problems with a colour set: [{ level, msg }]. National can't approve a set with errors.
function paletteIssues(p) {
  const out = [], primary = hexOk(p.primary), accent = hexOk(p.accent);
  if (!primary || !accent) return [{ level: 'error', msg: 'Colours must be codes like #2C3659.' }];
  if (contrast(primary, PAPER) < 4.5) out.push({ level: 'error', msg: `The dark colour is too light to read on the page background (${contrast(primary, PAPER).toFixed(1)}:1, needs 4.5:1).` });
  const on = contrast(accent, onColor(accent));
  if (on < 4.5) out.push({ level: 'warn', msg: `Text on the chapter colour is hard to read (${on.toFixed(1)}:1). Headers and buttons use it.` });
  return out;
}
// The approved lists for a chapter, from the national settings (lib/national.js).
const palettesFor = (nat) => (nat?.palettes?.length ? nat.palettes : PALETTES);
const fontsFor = (nat) => { const ids = (nat?.fonts || []).map(fontId), list = FONTS.filter((f) => ids.includes(f.id)); return list.length ? list : FONTS; };
// A site's theme settings resolved to concrete colours and fonts. custom: whether this chapter may use its own colours.
function resolveTheme(theme = {}, nat = {}, { custom = false } = {}) {
  const pals = palettesFor(nat), fonts = fontsFor(nat);
  const pal = theme.palette === 'custom' && custom ? { id: 'custom', primary: hexOk(theme.primary, '#2C3659'), accent: hexOk(theme.accent, '#C23B4F') } : pals.find((p) => p.id === theme.palette) || pals[0];
  return { palette: pal.id, primary: hexOk(pal.primary, '#2C3659'), accent: hexOk(pal.accent, '#C23B4F'), font: fonts.find((f) => f.id === fontId(theme.fonts)) || fonts[0], style: styleId(theme.style) };
}
// --ch-lite is the chapter colour lightened until it reads on the dark colour (linework and labels on dark panels).
function themeVars(t) {
  const ch = t.accent, navy = t.primary, ground = DESIGNS[styleId(t.style)].ground;
  return `--ch:${ch};--navy:${navy};--paper:${PAPER};--ink:${INK};--on-ch:${onColor(ch)};--ch-text:${readable(ch, ground, INK)};--ch-tint:${mix(ch, ground, 0.84)};--ch-deep:${mix(ch, '#1a1430', 0.42)};--ch-lite:${readable(ch, navy, '#ffffff')};--font-sign:${t.font.sign};--font-body:${t.font.body}`;
}
// Stylesheets a page needs: the font pairing's, plus any the design adds (none with system fonts, which load nothing).
const fontCss = (t) => (t.font.css ? [t.font.css, DESIGNS[styleId(t.style)].extra].filter(Boolean) : []);
// For old settings that stored colours directly: the matching approved set, or custom.
const paletteFor = (primary, accent) => (PALETTES.find((p) => p.primary.toLowerCase() === String(primary || '#2C3659').toLowerCase() && p.accent.toLowerCase() === String(accent || '#C23B4F').toLowerCase()) || { id: 'custom' }).id;

// Generated identity defaults (T5): two-letter initials and a favicon in the chapter colour.
const initials = (name) => (String(name || '').replace(/\b(chapter|the|of|for|and|cnl|citizens|new|liberalism)\b/gi, ' ').match(/[A-Za-z0-9]+/g) || ['N', 'L']).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
function faviconSvg(name, t) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${t.accent}"/><text x="32" y="42" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${initials(name).length > 1 ? 26 : 34}" text-anchor="middle" fill="${onColor(t.accent)}">${esc(initials(name))}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

module.exports = { PAPER, INK, PALETTES, FONTS, STYLES, DESIGNS, DEFAULT_STYLE, styleId, fontId, fontCss, hexOk, mix, contrast, onColor, readable, paletteIssues, palettesFor, fontsFor, resolveTheme, themeVars, paletteFor, initials, faviconSvg };
