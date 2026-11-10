'use strict';
// The side panel (a bottom sheet on phones): guidance for the field being edited, the selected section's
// settings, the page outline, the settings center and the checks list.

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico'];
const DEVICE_NAMES = { All: 'Phones and computers', 'Phones only': 'Phones only', 'Computers only': 'Computers only' };
let fieldSeq = 0;

// ---------- inputs with guidance (E9): label, required mark, hint, live counter
function counterText(text, f) {
  const t = String(text || ''), n = t.length, lines = t.split('\n').length;
  const over = (f.max && n > f.max) || (f.maxLines && lines > f.maxLines);
  let s = f.max ? `${n}/${f.max} characters` : '';
  if (f.maxLines) s += `${s ? ' · ' : ''}${lines}/${f.maxLines} lines`;
  return { s: s + (over ? ' · too long, shorten it' : ''), over };
}
// f.kind as in lib/fields.js; f.choices ([[value, label]]) for a select whose labels differ from its values.
// onMedia(meta) is called when an image comes from the media library or an upload (to fill in its description).
function fieldInput(f, value, onChange, { path, onMedia } = {}) {
  let i;
  const id = 'fld' + ++fieldSeq;
  const wrapIt = (input) => el('div', { class: 'field', 'data-path': path || null }, el('label', { for: id }, f.label, f.required ? el('span', { class: 'req', title: 'Required' }, ' *') : ''), input, f.hint ? el('p', { class: 'hint' }, f.hint) : '');
  if (f.kind === 'image') return wrapIt(imageInput(f, value, onChange, { id, onMedia }));
  if (f.kind === 'tags') return wrapIt(tagsInput(f, value, onChange));
  if (f.kind === 'ref') f = { ...f, choices: [['', f.required ? 'Pick one' : 'None'], ...(S.lists[f.col] || []).map((x) => [x.id, x.title + (x.live ? '' : ' (not published)')])] };
  if (f.kind === 'textarea') i = el('textarea', { id, rows: 3 });
  else if (f.choices) i = el('select', { id }, f.choices.map(([v, t]) => el('option', { value: v }, t)));
  else if (f.kind === 'select') i = el('select', { id }, f.options.map((o) => el('option', { value: o }, (f.key === 'layout' && S.layouts[o]) || o)));
  else if (f.kind === 'date') i = el('input', { id, type: f.dateOnly ? 'date' : 'datetime-local' });
  else if (f.kind === 'check') i = el('input', { id, type: 'checkbox', checked: !!value });
  else i = el('input', { id, type: f.kind === 'email' ? 'email' : 'text', inputmode: f.kind === 'url' ? 'url' : null, list: f.kind === 'url' ? 'cms-pages' : null, placeholder: f.placeholder || (f.kind === 'url' ? 'https://…  or a page like /events' : ''), autocomplete: 'off' });
  if (f.kind !== 'check') i.value = f.kind === 'date' ? String(value || '').slice(0, f.dateOnly ? 10 : 16) : value ?? '';
  const ct = f.max || f.maxLines ? el('p', { class: 'ct' }) : null;
  const upd = () => { if (ct) { const c = counterText(i.value, f); ct.textContent = c.s; ct.classList.toggle('over', !!c.over); } };
  i.addEventListener(i.tagName === 'SELECT' || f.kind === 'check' ? 'change' : 'input', () => { onChange(f.kind === 'check' ? i.checked : i.value); upd(); });
  upd();
  const label = el('label', { for: id }, f.label, f.required ? el('span', { class: 'req', title: 'Required' }, ' *') : '');
  return el('div', { class: 'field' + (f.kind === 'check' ? ' check' : ''), 'data-path': path || null }, f.kind === 'check' ? [i, label] : [label, i], f.hint ? el('p', { class: 'hint' }, f.hint) : '', ct);
}
// A page picker plus "another web address", for menu and footer links.
function linkPicker(label, value, onChange, hint) {
  const pages = (S.overview?.pages || []).map((p) => [p.home ? '/' : '/' + p.slug, p.title + (p.live ? '' : ' (not published)')]);
  const known = pages.some(([v]) => v === value);
  const sel = el('select', { 'aria-label': label + ': page' }, pages.map(([v, t]) => el('option', { value: v, selected: v === value }, t)), el('option', { value: '', selected: !known }, 'Another web address…'));
  const other = el('input', { type: 'text', inputmode: 'url', value: known ? '' : value || '', placeholder: 'https://…', hidden: known, 'aria-label': label + ': web address' });
  sel.onchange = () => { other.hidden = !!sel.value; onChange(sel.value || other.value); if (!sel.value) other.focus(); };
  other.oninput = () => onChange(other.value);
  return el('div', { class: 'field' }, el('label', {}, label), sel, other, hint ? el('p', { class: 'hint' }, hint) : '');
}
// Fields edited in the panel rather than on the page.
const isDetail = (f) => ['url', 'date', 'select', 'image', 'tags', 'ref'].includes(f.kind) || f.panel;
// An image from the library brings its description along, if the block or item has an empty one.
const fillAlt = (obj, key = 'alt') => (meta) => { if (key in obj && !obj[key] && meta.alt) { obj[key] = meta.alt; later(); } };
function detailFields(fields, obj, pre) {
  return fields.filter((f) => f.kind !== 'list' && isDetail(f) && !(f.key === 'layout')).map((f) => fieldInput(f, obj[f.key], (v) => { record('type', `${pre}.${f.key}`); obj[f.key] = v; changed(); later(); }, { path: `${pre}.${f.key}`, onMedia: fillAlt(obj) }));
}
// Tags (C3): tick the issues an item is about.
function tagsInput(f, value, onChange) {
  const list = S.lists[f.col] || [], cur = new Set(value || []);
  if (!list.length) return el('p', { class: 'hint' }, `No ${S.collections[f.col].label.toLowerCase()} yet. Add them under Content.`);
  return el('div', { class: 'chips tagpick' }, list.map((x) => el('label', { class: 'chip' + (cur.has(x.id) ? ' on' : '') }, el('input', { type: 'checkbox', checked: cur.has(x.id), onchange: (e) => { e.target.checked ? cur.add(x.id) : cur.delete(x.id); e.target.parentNode.classList.toggle('on', e.target.checked); onChange([...cur]); } }), ' ', x.title)));
}
// Images (M1, M2): pick from the media library, upload from the computer or the phone's camera, or paste a link.
function imageInput(f, value, onChange, { id, onMedia } = {}) {
  const inp = el('input', { id, type: 'text', value: value || '', placeholder: 'Upload or pick an image, or paste a link', autocomplete: 'off', inputmode: 'url' });
  const thumb = el('img', { class: 'thumb', alt: '', hidden: !value, src: value ? mediaSrc(value) : null });
  const rm = sbtn('Remove', () => setV(''), 'danger');
  rm.hidden = !value;
  const setV = (v, meta) => { inp.value = v; thumb.hidden = !v; rm.hidden = !v; if (v) thumb.src = mediaSrc(v); onChange(v); if (meta) onMedia?.(meta); };
  inp.addEventListener('input', () => { thumb.hidden = !inp.value; rm.hidden = !inp.value; if (inp.value) thumb.src = mediaSrc(inp.value); onChange(inp.value); });
  const file = el('input', { type: 'file', accept: 'image/*', hidden: true }), cam = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const up = async (input) => { const fl = input.files[0]; input.value = ''; if (!fl) return; try { const meta = await uploadImage(fl); setV(meta.url, meta); } catch (e) { toast(e.message); } };
  file.onchange = () => up(file); cam.onchange = () => up(cam);
  return el('div', { class: 'imgpick' }, thumb, el('div', { class: 'row' }, sbtn('Media library', () => mediaLibrary({ pick: (m) => setV(m.url, m) })), sbtn('Upload', () => file.click()), S.phone ? sbtn('Take a photo', () => cam.click()) : '', rm), inp, file, cam);
}
function fieldCounter(path) {
  const ct = $('#focCount'), f = S.foc === path && fieldDef(path);
  if (!ct || !f) return;
  const c = counterText(f.rich ? CMSText.plain(getPath(path)) : getPath(path), f);
  ct.textContent = c.s; ct.classList.toggle('over', !!c.over);
}
const sbtn = (label, onclick, cls = '') => el('button', { class: 'small ' + cls, onclick }, label);

// ---------- drawing
function drawPanel() {
  const p = $('#panel');
  const key = `${S.panel}|${S.sel}|${S.selAtom}`, keep = p.dataset.key === key ? p.scrollTop : 0;
  const body = S.panel === 'settings' ? settingsPanel() : S.panel === 'checks' ? checksPanel() : pagePanel();
  const title = S.panel === 'settings' ? 'Settings' : S.panel === 'checks' ? 'Checks' : S.page?.blocks[S.sel] ? S.schema[S.page.blocks[S.sel].type].label : S.kind === 'item' ? `This ${docWord()}` : 'This page';
  fill(p,
    el('div', { class: 'sheethead' }, el('strong', {}, title), S.panel === 'page' && S.page?.blocks.length ? [sbtn('◀', () => step(-1)), sbtn('▶', () => step(1))] : '', el('button', { class: 'small', 'aria-label': 'Close panel', onclick: () => sheet(false) }, 'Close')),
    ...body);
  p.dataset.key = key; p.scrollTop = keep;
  $('#pbSectionText').textContent = S.page?.blocks[S.sel] ? `Section ${S.sel + 1}/${S.page.blocks.length}` : 'Sections';
}
function sheet(open) { S.sheet = open; $('#panel').classList.toggle('open', open); document.body.classList.toggle('sheet-open', open); }
// Phone: one section at a time.
function step(d) {
  const n = S.page.blocks.length; if (!n) return;
  const i = S.sel < 0 ? (d > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, S.sel + d));
  S.panel = 'page'; selectBlock(i);
}

function pagePanel() {
  if (S.mode !== 'edit') return [el('p', { class: 'hint' }, S.mode === 'gallery' ? 'Every block the editor offers, filled with sample content. Use it to pick the right block, or to check how they all look.' : 'This is how visitors will see the page once it is published. Links work like they will on the live site.'), el('button', { class: 'primary', onclick: () => setMode('edit') }, 'Back to editing')];
  const out = [], fd = S.foc ? fieldDef(S.foc) : null;
  if (fd) {
    const c = counterText(fd.rich ? CMSText.plain(getPath(S.foc)) : getPath(S.foc), fd);
    out.push(el('section', { class: 'guide' },
      el('h2', {}, 'Editing: ', fd.label, fd.required ? el('span', { class: 'req' }, ' (required)') : ''),
      fd.hint ? el('p', { class: 'hint' }, fd.hint) : '',
      fd.max || fd.maxLines ? el('p', { class: 'ct' + (c.over ? ' over' : ''), id: 'focCount' }, c.s) : '',
      fd.rich ? el('p', { class: 'hint' }, 'Select words to make them bold, italic, a link, a list or a subheading with the bar above the text. Press Tab to go to the next text.') : el('p', { class: 'hint' }, 'Type right on the page. Press Tab to go to the next text.')));
    if (fd.options?.length && fd.kind !== 'select') {
      out.push(el('h2', {}, 'Prewritten options'), el('p', { class: 'hint' }, 'Tap one to use it. You can still edit it on the page.'));
      const path = S.foc;
      fd.options.forEach((o) => out.push(el('button', { class: 'opt', onclick: () => { record('struct'); setPath(path, o); say({ t: 'set', f: path, v: o }); changed(); fieldCounter(path); } }, o)));
    }
  }
  const b = S.page.blocks[S.sel];
  out.push(...(b ? sectionPanel(b) : outlinePanel()));
  return out;
}
function sectionPanel(b) {
  const def = S.schema[b.type], i = S.sel, out = [];
  out.push(el('h2', {}, 'Section: ', def.label), el('p', { class: 'hint' }, def.help), el('div', { class: 'row' },
    sbtn('↑ Up', () => act('up', i)), sbtn('↓ Down', () => act('down', i)), sbtn('Duplicate', () => act('dup', i)), sbtn('Delete', () => act('rm', i), 'danger')));
  if (b.type === 'saved') {
    const sec = (S.lists.sections || []).find((x) => x.id === b.props.ref);
    out.push(el('p', { class: 'note' }, sec ? `“${sec.title}” is a saved section${sec.usedOn?.length > 1 ? `, also used on ${sec.usedOn.filter((t) => t !== docTitle()).join(', ')}` : ''}. Edit it once and every page that uses it updates.` : 'This saved section no longer exists. Delete it, or pick another below.'),
      el('div', { class: 'row' }, sec ? sbtn('Edit it everywhere', () => openRef('sections/' + sec.id)) : '', sbtn('Turn into a separate copy', () => detach(i))));
  } else if (!(S.kind === 'item' && S.col === 'sections')) out.push(el('p', {}, sbtn('Save for reuse on other pages', () => saveForReuse(i))));
  if (def.view) {
    const cd = S.collections[def.view];
    out.push(el('p', { class: 'note' }, `Shows your ${cd.label.toLowerCase()}. Enter them once under Content and every ${def.label} section shows them.`), el('p', {}, sbtn(`Open ${cd.label}`, () => contentScreen(def.view))));
  }
  if (def.container) out.push(...columnsPanel(b));
  else {
    const det = detailFields(def.fields, b.props, String(i));
    if (det.length) out.push(el('h2', {}, 'Links and settings'), ...det);
    def.fields.filter((f) => f.kind === 'list').forEach((lf) => out.push(...listPanel(b, lf, def)));
  }
  out.push(visPanel(b, i));
  out.push(el('p', {}, sbtn('Done with this section', () => { S.sel = -1; S.foc = null; S.selAtom = null; say({ t: 'select', b: -1 }); drawPanel(); })));
  return out;
}
// Block scheduling and visibility (B4): between two times, on phones or computers only, until an event has passed.
function visPanel(b, i) {
  const v = { from: '', until: '', device: 'All', after: '', ...(b.vis || {}) };
  const set = (k) => (val) => {
    record('type', `${i}.vis.${k}`);
    const n = { ...v, [k]: val };
    if (n.from || n.until || n.after || n.device !== 'All') b.vis = n; else delete b.vis;
    Object.assign(v, n); changed(); later();
  };
  const events = (S.lists.events || []).filter((e) => e.start);
  const d = el('details', { class: 'vis', open: !!b.vis || S.openItems.has(`${i}.vis`) },
    el('summary', {}, 'When to show this section ', b.vis ? el('span', { class: 'tag warn' }, 'Limited') : ''),
    el('p', { class: 'hint' }, 'Show this section only for a while, or only on phones or computers. Times are your chapter’s local time. Hidden sections stay here, dimmed, so you can change your mind.'),
    fieldInput({ key: 'from', label: 'Show from', kind: 'date', hint: 'Optional. Hidden before this time.' }, v.from, set('from')),
    fieldInput({ key: 'until', label: 'Hide after', kind: 'date', hint: 'Optional. Hidden from this time on.' }, v.until, set('until')),
    fieldInput({ key: 'device', label: 'Show on', kind: 'select', choices: Object.entries(DEVICE_NAMES) }, v.device, set('device')),
    events.length ? fieldInput({ key: 'after', label: 'Hide once this event is over', kind: 'select', choices: [['', 'No event'], ...events.map((e) => [e.id, `${e.title} (${CMSText.shortDate(e.start)})`])] }, v.after, set('after')) : '');
  d.addEventListener('toggle', () => (d.open ? S.openItems.add(`${i}.vis`) : S.openItems.delete(`${i}.vis`)));
  return d;
}
function columnsPanel(b) {
  const out = [], i = S.sel;
  out.push(el('h2', {}, 'Layout'), el('div', { class: 'chips' }, Object.entries(S.layouts).map(([k, name]) => el('button', { class: 'small' + (b.props.layout === k ? ' on' : ''), onclick: () => setLayout(b, k) }, name))));
  b.props.cols.forEach((col, c) => {
    out.push(el('h2', {}, `Column ${c + 1}`));
    if (!col.length) out.push(el('p', { class: 'hint' }, 'Empty. Add a block below, or drag one here on the page.'));
    col.forEach((a, k) => {
      const key = `${i}.atom.${c}.${k}`, open = S.openItems.has(key), adef = S.schema[a.type], det = detailFields(adef.fields, a.props, `${i}.cols.${c}.${k}`);
      const name = a.props.heading || a.props.title || a.props.label || a.props.caption || '';
      const row = el('div', { class: 'item' + (S.selAtom === `${c}.${k}` ? ' cur' : '') }, el('div', { class: 'row' },
        el('strong', {}, adef.label + (name ? `: ${name}` : '')),
        sbtn('↑', () => act('up', i, `${c}.${k}`)), sbtn('↓', () => act('down', i, `${c}.${k}`)),
        det.length ? sbtn(open ? 'Hide' : 'Details', () => { open ? S.openItems.delete(key) : S.openItems.add(key); drawPanel(); }) : '',
        sbtn('✕', () => act('rm', i, `${c}.${k}`), 'danger')));
      if (open) row.append(...det);
      out.push(row);
    });
    const s = el('select', { 'aria-label': `Add a block to column ${c + 1}` }, el('option', { value: '' }, '＋ Add a block to this column'), S.atoms.map((t) => el('option', { value: t }, S.schema[t].label)));
    s.onchange = () => { if (s.value) addAtom(i, c, s.value); };
    out.push(s);
  });
  return out;
}
function listPanel(b, lf, def) {
  const arr = (b.props[lf.key] ||= []), i = S.sel, out = [el('h2', {}, lf.label)];
  if (!arr.length) out.push(el('p', { class: 'hint' }, `No ${lf.label.toLowerCase()} yet. Add one below.`));
  arr.forEach((it, j) => {
    const key = `${i}.${lf.key}.${j}`, open = S.openItems.has(key), det = detailFields(lf.fields, it, `${i}.${lf.key}.${j}`);
    const row = el('div', { class: 'item' }, el('div', { class: 'row' },
      el('strong', {}, it[lf.itemLabel] || `New ${lf.label.toLowerCase().replace(/s$/, '')}`),
      sbtn('↑', () => { record('struct'); if (move(arr, j, -1)) structural(); }), sbtn('↓', () => { record('struct'); if (move(arr, j, 1)) structural(); }),
      det.length ? sbtn(open ? 'Hide' : 'Details', () => { open ? S.openItems.delete(key) : S.openItems.add(key); drawPanel(); }) : '',
      sbtn('✕', async () => { if (await confirmBox(`Remove “${it[lf.itemLabel] || 'this item'}”?`, 'Remove', true)) { record('struct'); arr.splice(j, 1); structural(); toast('Removed', { label: 'Undo', run: undo }); } }, 'danger')));
    if (open) row.append(...det);
    out.push(row);
  });
  const blank = () => Object.fromEntries(lf.fields.map((x) => [x.key, x.kind === 'select' ? x.options[0] : '']));
  const add = (item) => { record('struct'); arr.push(clone(item)); S.openItems.add(`${i}.${lf.key}.${arr.length - 1}`); structural(); };
  out.push(el('h2', {}, `Add to ${lf.label.toLowerCase()}`), el('div', { class: 'chips' }, (def.presets || []).map((x) => sbtn('+ ' + x.label, () => add(x.item))), sbtn('+ Blank', () => add(blank()))));
  return out;
}
// An item's own fields that aren't edited on the page: dates, links, images, tags and the like.
function itemPanel() {
  const cd = colDef(), out = [el('h2', {}, `${cd.one} details`)];
  const set = (f) => (v) => { record('type', 'f.' + f.key); S.page[f.key] = v; changed(); later(); };
  if (S.path) out.push(el('p', { class: 'hint' }, 'Page address: ', el('span', { class: 'mono' }, S.path), S.live ? '' : ' (once published)'));
  if (S.col === 'sections') {
    const sec = (S.lists.sections || []).find((x) => x.id === S.id);
    out.push(el('p', { class: 'note' }, sec?.usedOn?.length ? `Used on ${sec.usedOn.join(', ')}. Changes show on all of them when you publish.` : 'Not used on any page yet. Add it to a page from “Add a section”.'));
  }
  out.push(el('p', { class: 'hint' }, cd.fields.some((f) => !isDetail(f)) ? 'Text like the name and description is edited right on the page. The rest is here.' : ''));
  out.push(...cd.fields.filter(isDetail).map((f) => fieldInput(f, S.page[f.key], set(f), { path: 'f.' + f.key })));
  return out;
}
function outlinePanel() {
  const item = S.kind === 'item', cd = colDef();
  const out = item ? itemPanel() : [];
  if (item && !cd.body) return out;
  out.push(el('h2', {}, item && S.col !== 'sections' ? `More sections on this ${cd.one}’s page` : 'Sections on this page'));
  const preview = (b) => { const p = b.props || {}; const t = (b.type === 'saved' && ((S.lists.sections || []).find((x) => x.id === p.ref)?.title || p.ref)) || p.heading || p.title || p.label || (p.cols || []).flat().map((a) => a.props.heading || a.props.title || '').find(Boolean) || ''; return String(t).replace(/\n/g, ' '); };
  if (!S.page.blocks.length) out.push(el('p', { class: 'hint' }, item ? (S.col === 'sections' ? 'Empty. Add the section to save.' : 'Optional. Add photos, a video, an FAQ or anything else below the details.') : 'This page is empty. Add a section to start.'));
  S.page.blocks.forEach((b, i) => out.push(el('div', { class: 'item outline' }, el('button', { class: 'linkish', onclick: () => selectBlock(i) }, el('b', {}, `${i + 1}. ${S.schema[b.type].label}`), preview(b) ? el('span', {}, ' · ' + preview(b)) : ''), sbtn('↑', () => act('up', i)), sbtn('↓', () => act('down', i)))));
  out.push(el('p', {}, el('button', { class: 'primary', onclick: () => chooseBlock(S.page.blocks.length) }, '＋ Add a section')));
  out.push(el('p', { class: 'hint' }, 'Tap any text on the page to edit it. Tap a section to see its options here. Drag sections by their ⠿ handle. Everything saves as you go, and nothing goes live until you publish.'));
  if (S.updated?.at) out.push(el('p', { class: 'hint' }, `Last saved by ${S.updated.by || 'someone'}, ${ago(S.updated.at)}.`));
  if (S.back) out.push(el('p', {}, sbtn(`← Back to ${S.back.title}`, goBack)));
  return out;
}

// ---------- settings center (T6) with the menu editor (T4), announcement bar, footer and connections (B5)
async function openSettings(section) {
  if (!(await flush())) return;
  try { const g = await api(`chapter/${S.chapter}/site`); S.site = g.site; S.siteRev = g.rev; } catch (e) { return toast(e.message); }
  S.panel = 'settings'; S.settingsSection = section || S.settingsSection || 'basics';
  S.sitePreview = S.site; sheet(true); drawPanel(); heartbeat(); refreshChecks();
}
function closeSettings() { S.panel = 'page'; S.sitePreview = null; drawPanel(); heartbeat(); preview(); }
function siteChanged(redraw) {
  S.sitePreview = S.site; S.siteDirty = true;
  clearTimeout(S.siteTimer); S.siteTimer = setTimeout(saveSite, 800);
  later(); if (redraw) drawPanel();
  $('#status').textContent = 'Saving…'; $('#status').className = 'pill';
}
async function saveSite() {
  if (!S.siteDirty || S.siteSaving) return;
  S.siteDirty = false; S.siteSaving = true;
  try { const r = await api(`chapter/${S.chapter}/site`, 'PUT', { site: S.site, baseRev: S.siteRev }); S.siteRev = r.rev; await refreshOverview(); refreshChecks(); }
  catch (e) {
    if (e.status === 409) {
      const cur = e.data.current;
      const c = await ask(`${cur.by || 'Someone'} changed the settings ${ago(cur.at)}, while you were editing`, [el('p', {}, 'Pick which version to keep. The other one is saved in History.')], [{ label: `Use ${cur.by || 'their'}’s`, value: 'theirs' }, { label: 'Keep mine', value: 'mine', class: 'primary' }]);
      if (c === 'mine') { await api(`chapter/${S.chapter}/versions/@site/stash`, 'POST', { doc: cur.site, name: `${cur.by || 'Their'} settings before ${S.me.name || 'my'} overwrite` }).catch(() => {}); S.siteRev = cur.rev; S.siteDirty = true; }
      else { await api(`chapter/${S.chapter}/versions/@site/stash`, 'POST', { doc: S.site, name: `${S.me.name || 'My'} settings edits` }).catch(() => {}); S.site = cur.site; S.siteRev = cur.rev; S.sitePreview = S.site; drawPanel(); preview(); }
    } else { S.siteDirty = true; toast("Couldn't save the settings: " + e.message); }
  } finally { S.siteSaving = false; if (S.siteDirty) saveSite(); }
}
function settingsPanel() {
  const s = S.site; if (!s) return [];
  const set = (obj, key, redraw) => (v) => { obj[key] = v; siteChanged(redraw); };
  const issues = (sec) => S.checks.site.filter((c) => c.section === sec).map((c) => el('p', { class: 'issue ' + c.level }, c.msg));
  const section = (key, title, kids) => {
    const d = el('details', { open: S.settingsSection === key }, el('summary', {}, title, S.checks.site.some((c) => c.section === key && c.level === 'error') ? el('span', { class: 'dot bad', title: 'Has a problem' }) : ''), issues(key), kids);
    d.addEventListener('toggle', () => { if (d.open) S.settingsSection = key; });
    return d;
  };
  const F = (f, obj, redraw) => fieldInput(f, obj[f.key], set(obj, f.key, redraw));
  const homeOpts = (S.overview?.pages || []).map((p) => p.slug);
  const out = [el('p', { class: 'hint' }, 'Changes save as a draft as you type and show in the preview. They go live when you publish.')];
  out.push(section('basics', 'Chapter basics', [
    F({ key: 'name', label: 'Chapter name', kind: 'text', max: 60, required: true }, s),
    F({ key: 'tagline', label: 'Tagline', kind: 'text', max: 120, hint: 'Shown in search results and link previews.' }, s),
    F({ key: 'contact_email', label: 'Contact email', kind: 'email', hint: 'Shown in the footer.' }, s),
    F({ key: 'timezone', label: 'Timezone', kind: 'select', options: TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES], hint: 'Used for event times and the announcement end date.' }, s),
    el('div', { class: 'field' }, el('label', {}, 'Homepage'), (() => { const x = el('select', {}, homeOpts.map((h) => el('option', { value: h, selected: h === s.home }, S.overview.pages.find((p) => p.slug === h).title))); x.onchange = () => setHome(x.value); return x; })(), el('p', { class: 'hint' }, 'The page people see at your main address.')),
  ]));
  out.push(section('look', 'Look', lookSection(s)));
  out.push(section('identity', 'Logo and identity', identitySection(s)));
  out.push(section('menu', 'Menu', menuEditor(s)));
  const a = s.announcement;
  out.push(section('announcement', 'Announcement bar', [
    el('p', { class: 'hint' }, 'A strip across the top of every page for something urgent: an election deadline, a big event.'),
    F({ key: 'on', label: 'Show the announcement bar', kind: 'check' }, a, true),
    F({ key: 'text', label: 'Announcement', kind: 'text', max: 120, hint: 'One short sentence.' }, a),
    F({ key: 'link_label', label: 'Link text', kind: 'text', max: 30, hint: 'Optional, like “RSVP” or “Find your polling place”.' }, a),
    linkPicker('Link', a.url, set(a, 'url')),
    F({ key: 'from', label: 'Show it from', kind: 'date', dateOnly: true, hint: 'Optional. The bar appears on its own on this day.' }, a),
    F({ key: 'until', label: 'Hide it after', kind: 'date', dateOnly: true, hint: 'Optional. The bar disappears on its own after this day.' }, a),
  ]));
  out.push(section('footer', 'Footer', [
    F({ key: 'footer', label: 'Footer text', kind: 'textarea', max: 300 }, s),
    el('label', {}, 'Footer links'), ...s.footer_links.map((l, i) => el('div', { class: 'item' }, el('div', { class: 'row' }, el('strong', {}, l.label || 'New link'), sbtn('↑', () => { if (move(s.footer_links, i, -1)) siteChanged(true); }), sbtn('↓', () => { if (move(s.footer_links, i, 1)) siteChanged(true); }), sbtn('✕', () => { s.footer_links.splice(i, 1); siteChanged(true); }, 'danger')), F({ key: 'label', label: 'Link text', kind: 'text', max: 40 }, l), linkPicker('Goes to', l.url, set(l, 'url')))),
    s.footer_links.length < 12 ? sbtn('+ Add a footer link', () => { s.footer_links.push({ label: '', url: '' }); siteChanged(true); }) : '',
    F({ key: 'disclaimer', label: 'Disclaimer', kind: 'text', max: 300, hint: 'For example a “Paid for by…” line, if your chapter needs one. Shown in a box at the bottom.' }, s),
  ]));
  out.push(section('connections', 'Connections', [
    el('p', { class: 'hint' }, 'Links to the tools your chapter uses. Blocks use these when their own link is left empty.'),
    F({ key: 'action_network_url', label: 'Sign-up form', kind: 'url', hint: 'Your Action Network, Mailchimp or Google Form link. Used by Email sign-up blocks.' }, s.connections),
    F({ key: 'luma_calendar_url', label: 'Luma calendar', kind: 'url', hint: 'Used for the “Full calendar” link on event lists.' }, s.connections),
    F({ key: 'donate_url', label: 'Donate page', kind: 'url', hint: 'Add it to the menu as a button to make it stand out.' }, s.connections),
  ]));
  out.push(section('social', 'Social accounts', [
    F({ key: 'x', label: 'X / Twitter handle', kind: 'text', placeholder: '@yourchapter' }, s.social),
    F({ key: 'ig', label: 'Instagram handle', kind: 'text' }, s.social),
    F({ key: 'bsky', label: 'Bluesky handle', kind: 'text', placeholder: 'yourchapter.bsky.social' }, s.social),
    F({ key: 'fb', label: 'Facebook page', kind: 'text', placeholder: 'Page name or full link' }, s.social),
  ]));
  out.push(el('div', { class: 'row' }, el('button', { class: 'primary', onclick: closeSettings }, 'Done'),
    S.overview?.siteDraft ? sbtn('Undo all unpublished settings changes', async () => { if (await confirmBox('Go back to the published settings? Your unpublished settings changes will be lost.', 'Go back', true)) { await api(`chapter/${S.chapter}/site/discard`, 'POST', {}); await openSettings(); await refreshOverview(); preview(); } }, 'danger') : ''));
  return out;
}
// The look (T1, T2): a style, an approved colour set and fonts. Content never changes when these do.
function lookSection(s) {
  const look = S.overview?.look || { styles: {}, palettes: [], fonts: [] }, th = s.theme;
  const pick = (k, v) => () => { th[k] = v; siteChanged(true); };
  const custom = look.custom && th.palette === 'custom';
  return [
    el('p', { class: 'hint' }, 'Change how every page looks. Your words and pictures stay as they are.'),
    el('label', {}, 'Design'), el('div', { class: 'seg wraps' }, Object.entries(look.styles).map(([k, d]) => el('button', { class: th.style === k ? 'on' : '', onclick: pick('style', k) }, d.name))),
    look.styles[th.style] ? el('p', { class: 'hint' }, look.styles[th.style].hint) : '',
    el('label', {}, 'Colours'), el('div', { class: 'palettes' }, look.palettes.map((p) => el('button', { class: 'pal' + (th.palette === p.id ? ' on' : ''), onclick: pick('palette', p.id), title: p.name },
      el('span', { class: 'sw2' }, el('i', { style: `background:${p.primary}` }), el('i', { style: `background:${p.accent}` })), p.name)),
    look.custom ? el('button', { class: 'pal' + (custom ? ' on' : ''), onclick: () => { th.primary ||= look.palettes[0]?.primary || '#2C3659'; th.accent ||= look.palettes[0]?.accent || '#C23B4F'; pick('palette', 'custom')(); } }, el('span', { class: 'sw2' }, el('i', { style: `background:${th.primary || '#ccc'}` }), el('i', { style: `background:${th.accent || '#eee'}` })), 'Custom') : ''),
    look.custom ? '' : el('p', { class: 'hint' }, 'National approves these colour sets, already checked so text is easy to read.'),
    custom ? [
      fieldInput({ key: 'accent', label: 'Chapter colour (hex code)', kind: 'text', placeholder: '#C23B4F' }, th.accent, (v) => { th.accent = v; siteChanged(); }),
      fieldInput({ key: 'primary', label: 'Dark colour (hex code)', kind: 'text', placeholder: '#2C3659', hint: 'Used for text, borders and buttons. It must be dark enough to read; the checks tell you if it isn’t.' }, th.primary, (v) => { th.primary = v; siteChanged(); }),
    ] : '',
    fieldInput({ key: 'fonts', label: 'Fonts', kind: 'select', choices: look.fonts.map((f) => [f.id, f.name]) }, th.fonts, (v) => { th.fonts = v; siteChanged(); }),
  ];
}
// The identity kit (T5): logo (approved by national), browser tab icon, share image, team photo.
function identitySection(s) {
  const id = s.identity, th = s.theme;
  const img = (key, label, hint, obj = id) => fieldInput({ key, label, kind: 'image', hint }, obj[key], (v) => { obj[key] = v; siteChanged(); });
  return [
    th.logo_request ? el('div', { class: 'note' }, el('p', {}, 'Waiting for national to approve your new logo. Your current logo shows until then.'), el('img', { class: 'thumb', src: mediaSrc(th.logo_request), alt: 'New logo waiting for approval' })) : '',
    fieldInput({ key: 'logo', label: 'Logo', kind: 'image', hint: 'Optional, shown in the header. A new logo goes to national for a quick approval first.' }, th.logo, (v) => { th.logo = v; siteChanged(); }),
    img('favicon', 'Browser tab icon', 'Optional. A small square image. Without one, your initials in your chapter colour are used.'),
    img('share_image', 'Share image', 'Shown when someone shares a page that has no image of its own. Best at 1200 × 630.'),
    id.share_image ? '' : el('div', { class: 'field' }, id.share_auto ? el('img', { class: 'thumb wide', src: mediaSrc(id.share_auto), alt: 'Generated share image' }) : '', el('div', { class: 'row' }, sbtn(id.share_auto ? 'Make a new one' : 'Make one from the chapter name', makeShareImage), el('span', { class: 'hint' }, 'Uses your name, tagline and colours.'))),
    img('team_photo', 'Team photo', 'Used by people lists when nobody has a photo yet.'),
  ];
}
// A share image drawn from the chapter's name and colours (the generated default in T5).
async function makeShareImage() {
  const s = S.site, look = S.overview.look, p = look.palettes.find((x) => x.id === s.theme.palette) || (s.theme.palette === 'custom' ? { primary: s.theme.primary, accent: s.theme.accent } : look.palettes[0]);
  const c = el('canvas', { width: 1200, height: 630 }), g = c.getContext('2d');
  g.fillStyle = p.primary; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = p.accent; g.fillRect(0, 520, 1200, 110);
  g.fillStyle = '#FDFBE9'; g.font = '900 84px Arial, Helvetica, sans-serif'; g.textBaseline = 'top';
  const words = String(s.name || 'Our chapter').toUpperCase().split(/\s+/), lines = [''];
  for (const w of words) { const t = (lines[lines.length - 1] + ' ' + w).trim(); if (g.measureText(t).width > 1040 && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = t; }
  lines.slice(0, 4).forEach((l, i) => g.fillText(l, 80, 90 + i * 96));
  g.font = '600 34px Georgia, serif'; g.fillStyle = '#FDFBE9'; g.fillText(String(s.tagline || '').slice(0, 70), 80, 552);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  try { const meta = await uploadImage(new File([blob], 'share-image.png', { type: 'image/png' })); s.identity.share_auto = meta.url; siteChanged(true); } catch (e) { toast(e.message); }
}
function menuEditor(s) {
  const out = [el('p', { class: 'hint' }, 'Up to 12 links. Make one a button to make it stand out, like “Join” or “Donate”. Add links under an item to make a dropdown.')];
  const navItem = (n, i, list, depth) => {
    const kids = el('div', { class: 'item' + (depth ? ' child' : '') }, el('div', { class: 'row' },
      el('strong', {}, n.label || 'New link'),
      sbtn('↑', () => { if (move(list, i, -1)) siteChanged(true); }), sbtn('↓', () => { if (move(list, i, 1)) siteChanged(true); }),
      sbtn('✕', () => { list.splice(i, 1); siteChanged(true); }, 'danger')),
      fieldInput({ key: 'label', label: 'Label', kind: 'text', max: 24 }, n.label, (v) => { n.label = v; siteChanged(); }),
      linkPicker(depth || !n.children?.length ? 'Goes to' : 'Goes to (optional for a dropdown)', n.path, (v) => { n.path = v; siteChanged(); }));
    if (!depth) {
      kids.append(el('div', { class: 'seg small' }, ['link', 'button'].map((st) => el('button', { class: (n.style || 'link') === st ? 'on' : '', onclick: () => { n.style = st; siteChanged(true); } }, st === 'link' ? 'Plain link' : 'Button'))));
      (n.children || []).forEach((c, j) => kids.append(navItem(c, j, n.children, 1)));
      if ((n.children || []).length < 12) kids.append(sbtn(n.children?.length ? '+ Add a link to this dropdown' : '+ Turn into a dropdown', () => { (n.children ||= []).push({ label: '', path: '/' }); siteChanged(true); }));
    }
    return kids;
  };
  s.nav.forEach((n, i) => out.push(navItem(n, i, s.nav, 0)));
  if (s.nav.length < 12) out.push(sbtn('+ Add a menu link', () => { s.nav.push({ label: '', path: '/', style: 'link' }); siteChanged(true); }));
  return out;
}

// ---------- checks (Q1)
function openChecks() { S.panel = 'checks'; sheet(true); drawPanel(); refreshChecks(); }
function checksPanel() {
  const out = [el('p', { class: 'hint' }, 'Problems in red must be fixed before publishing. Tips in yellow are worth a look. These run as you edit.')];
  const list = (title, items, onShow) => {
    out.push(el('h2', {}, title));
    if (!items.length) { out.push(el('p', { class: 'okline' }, '✓ No problems found.')); return; }
    items.slice().sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1)).forEach((c) => out.push(el('div', { class: 'issue ' + c.level },
      el('p', {}, c.msg), c.section || c.itemName ? el('p', { class: 'meta' }, [c.section, c.itemName].filter(Boolean).join(' · ')) : '',
      el('div', { class: 'row' }, sbtn('Show me', () => onShow(c)), c.fix && c.path ? sbtn('Fix it', () => { record('struct'); setPath(c.path, c.fix); structural(); refreshChecks(); toast('Fixed', { label: 'Undo', run: undo }); }) : ''))));
  };
  list(`This ${docWord()}: ${docTitle()}`, S.checks.page, showIssue);
  list('Site settings', S.checks.site, (c) => openSettings(c.section));
  out.push(el('p', {}, sbtn('Back', () => { S.panel = 'page'; drawPanel(); })));
  return out;
}
function showIssue(c) {
  if (c.field) return pageSettings();
  if (c.block == null) return;
  if (c.block === -1) { // one of an item's own fields
    S.panel = 'page'; S.sel = -1; S.foc = null; S.selAtom = null; say({ t: 'select', b: -1 }); say({ t: 'flash', f: c.path });
    drawPanel();
    const inPanel = $(`#panel [data-path="${c.path}"]`);
    if (inPanel) { inPanel.scrollIntoView({ block: 'center' }); inPanel.classList.add('flash'); inPanel.querySelector('input,select,textarea')?.focus({ preventScroll: true }); }
    return;
  }
  S.panel = 'page'; S.sel = c.block; S.foc = null;
  const parts = String(c.path || '').split('.');
  if (parts[1] === 'cols') { S.selAtom = `${parts[2]}.${parts[3]}`; S.openItems.add(`${c.block}.atom.${S.selAtom}`); }
  else if (c.item != null) S.openItems.add(`${c.block}.${parts[1]}.${c.item}`);
  say({ t: 'select', b: c.block, atom: S.selAtom }); say({ t: 'flash', f: c.path, b: c.block });
  drawPanel();
  const inPanel = $(`#panel [data-path="${c.path}"]`);
  if (inPanel) { inPanel.scrollIntoView({ block: 'center' }); inPanel.classList.add('flash'); inPanel.querySelector('input,select,textarea')?.focus({ preventScroll: true }); }
}
