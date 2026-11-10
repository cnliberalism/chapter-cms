'use strict';
// Stage 2, the content model: shared collections and their pages, tags, saved sections, visibility, themes,
// feature switches, media, schedules, contact forms, migrations and the content API.
const test = require('node:test');
const assert = require('node:assert');
const { setup, seed } = require('./helpers');
const { blocks: B } = require('../lib/blocks');
const { templates } = require('../lib/templates');

const AT = '2026-10-14T17:00:00Z'; // noon in Demo City (America/Chicago)
const live = async (cms, p) => (await cms.renderLive('demo', p));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('migration: inline lists from Stage 1 pages move into collections once, matched and never duplicated', async () => {
  const v1 = { demo: { site: seed().demo.site, 'page/home': { title: 'Home', blocks: [
    { type: 'events_list', props: { heading: 'Show up', events: [{ id: 'evt-1', title: 'Meetup', start: '2026-11-05T18:30', location: 'Taproom' }, { title: 'Picnic', start: '2026-08-01T12:00' }] } },
    { type: 'people_grid', props: { heading: 'Team', people: [{ name: 'Zoe Ng', role: 'Lead' }, { name: 'Ana Ruiz', role: 'Events' }] } },
  ] }, 'draft/news': { title: 'News', blocks: [{ type: 'posts_list', props: { heading: 'News', posts: [{ title: 'Hello', date: '2026-10-01T12:00', type: 'Post' }] } }] } } };
  const { cms, store } = setup({ at: AT, data: v1 });
  await cms.overview('demo');
  assert.deepStrictEqual((await store.list('demo', 'item/events/')).sort(), ['item/events/meetup', 'item/events/picnic']);
  assert.deepStrictEqual((await store.list('demo', 'item/people/')).sort(), ['item/people/ana-ruiz', 'item/people/zoe-ng']);
  assert.deepStrictEqual((await cms.listItems('demo', 'people')).map((p) => p.name), ['Zoe Ng', 'Ana Ruiz'], 'lists keep the order they had');
  assert.deepStrictEqual(await store.list('demo', 'idraft/posts/'), ['idraft/posts/hello'], 'items from a draft page stay drafts');
  const home = await store.get('demo', 'page/home');
  assert.strictEqual(home.blocks[0].v, 2); assert.ok(!('events' in home.blocks[0].props), 'the list now shows the shared events');
  assert.strictEqual((await store.get('demo', 'meta')).schema, 2);
  assert.match((await live(cms, '')).html, /Meetup/);
  assert.match((await live(cms, 'events/meetup')).html, /Taproom/);
  // restoring an old version re-extracts its items without duplicating them
  const v = (await cms.versions('demo', 'home'));
  assert.strictEqual(v.length, 0);
  const again = createAgain(store);
  await again.overview('demo');
  assert.strictEqual((await store.list('demo', 'item/events/')).length, 2, 'runs once');
});
function createAgain(store) { return require('../lib/cms').createCms({ store, now: () => new Date(AT) }); }

test('collection items: drafts, publishing, conflicts, duplicates, addresses, unpublish, trash', async () => {
  const { cms, call } = setup({ at: AT });
  const r = (await call('POST', 'chapter/demo/items/events', { title: 'Zoning Hearing' })).body;
  assert.deepStrictEqual(r, { col: 'events', id: 'zoning-hearing' });
  assert.strictEqual((await live(cms, 'events/zoning-hearing')).status, 404, 'drafts are private');
  let g = (await call('GET', 'chapter/demo/item/events/zoning-hearing')).body;
  g.item.start = '2026-11-12T18:00'; g.item.location = 'City Hall'; g.item.issues = ['housing-abundance', 'nope!'];
  const s = await call('PUT', 'chapter/demo/item/events/zoning-hearing', { item: g.item, baseRev: g.rev }, 'Ana');
  assert.strictEqual(s.status, 200); assert.deepStrictEqual(s.body.item.issues, ['housing-abundance'], 'tags are cleaned');
  assert.strictEqual((await call('PUT', 'chapter/demo/item/events/zoning-hearing', { item: g.item, baseRev: g.rev })).status, 409, 'stale saves conflict');
  assert.strictEqual((await call('POST', 'chapter/demo/item/events/zoning-hearing/rename', { id: 'hearing' })).body.id, 'hearing');
  const pub = await call('POST', 'chapter/demo/publish', { items: ['item:events/hearing'] });
  assert.deepStrictEqual(pub.body.published, ['item:events/hearing']);
  const page = await live(cms, 'events/hearing');
  assert.strictEqual(page.status, 200); assert.match(page.html, /City Hall/); assert.match(page.html, /href="\/issues\/housing-abundance"/);
  assert.match((await live(cms, '')).html, /href="\/events\/hearing"/, 'every events section shows it');
  assert.strictEqual((await call('POST', 'chapter/demo/item/events/hearing/rename', { id: 'x' })).status, 400, 'published addresses stay put');
  const dup = (await call('POST', 'chapter/demo/item/events/hearing/duplicate', {})).body;
  assert.strictEqual((await call('GET', `chapter/demo/item/events/${dup.id}`)).body.item.title, 'Zoning Hearing (copy)');
  await call('POST', 'chapter/demo/item/events/hearing/unpublish', {});
  assert.strictEqual((await live(cms, 'events/hearing')).status, 404);
  const t = (await call('POST', 'chapter/demo/item/events/hearing/delete', {})).body.trashed;
  assert.strictEqual((await call('GET', 'chapter/demo')).body.trash[0].col, 'events');
  assert.deepStrictEqual((await call('POST', `chapter/demo/trash/${t}/restore`, {})).body, { col: 'events', id: 'hearing' });
  // the history of an item works like a page's
  const v = (await call('GET', 'chapter/demo/versions/@events-hearing')).body;
  assert.ok(v.some((x) => x.kind === 'publish') && v.some((x) => x.by === 'Ana'));
});

test('item pages, the past-events archive and automatic list pages (C2, R2)', async () => {
  const { cms, call } = setup({ at: AT });
  const picnic = (await live(cms, 'events/summer-picnic')).html;
  assert.match(picnic, /This event has passed/); assert.ok(!/>RSVP</.test(picnic.split('<main')[1]), 'no RSVP once it is over');
  const events = (await live(cms, 'events')).html;
  assert.ok(!events.includes('Summer Picnic'), 'the upcoming list leaves past events out'); assert.match(events, /href="\/events\/archive"/);
  const archive = await live(cms, 'events/archive');
  assert.strictEqual(archive.status, 200); assert.match(archive.html, /Summer Picnic/); assert.ok(!archive.html.includes('Book Club'));
  // with no page at /people, the address shows an automatic list
  assert.match((await live(cms, 'people')).html, /Alex Rivera/);
  assert.ok(!(await live(cms, 'people')).html.includes('Jamie Chen'), 'alumni are left out of the team list');
  assert.match((await live(cms, 'people/jamie-chen')).html, /Alumni/);
  assert.strictEqual((await live(cms, 'events/nope')).status, 404);
  assert.strictEqual((await live(cms, 'nope/x')).status, 404);
  // endorsements move to results after the election, on their own
  const { cms: later } = setup({ at: '2026-11-10T17:00:00Z' });
  assert.match((await live(later, 'endorsements/results')).html, /Jordan Lee/);
  assert.ok(!(await call('GET', 'chapter/demo/items/people')).body.find((p) => p.id === 'alex-rivera').past);
  assert.ok((await call('GET', 'chapter/demo/items/people')).body.find((p) => p.id === 'jamie-chen').past);
});

test('issue tags: an issue page lists everything tagged with it (C3)', async () => {
  const { cms } = setup({ at: AT });
  const h = (await live(cms, 'issues/housing-abundance')).html;
  for (const t of ['Monthly Meetup', 'Book Club: Abundance', 'Why Demo City needs more homes', 'Jordan Lee']) assert.ok(h.includes(t), t);
  assert.ok(!h.includes('Voter Registration Drive'), 'untagged items stay off');
  const f = (await live(cms, 'issues/free-trade')).html;
  assert.ok(!f.includes('Upcoming events'), 'empty related lists hide themselves');
});

test('one entry, shown everywhere: an edit to an item changes every list that shows it', async () => {
  const { cms, call } = setup({ at: AT });
  const g = (await call('GET', 'chapter/demo/item/events/voter-registration-drive')).body;
  g.item.title = 'Big Voter Drive';
  await call('PUT', 'chapter/demo/item/events/voter-registration-drive', { item: g.item, baseRev: g.rev });
  await call('POST', 'chapter/demo/publish', {});
  for (const p of ['', 'events', 'issues/state-capacity', 'events/voter-registration-drive']) assert.match((await live(cms, p)).html, /Big Voter Drive/, p || 'home');
});

test('saved sections: edit once and every page updates; in use means it cannot be deleted (B3)', async () => {
  const { cms, call } = setup({ at: AT });
  const sec = (await call('GET', 'chapter/demo/items/sections')).body[0];
  assert.deepStrictEqual(sec.usedOn.sort(), ['Events', 'Home']);
  const g = (await call('GET', `chapter/demo/item/sections/${sec.id}`)).body;
  g.item.blocks[0].props.heading = 'Join us today';
  await call('PUT', `chapter/demo/item/sections/${sec.id}`, { item: g.item, baseRev: g.rev });
  assert.ok(!(await live(cms, '')).html.includes('Join us today'), 'not live until published');
  await call('POST', 'chapter/demo/publish', {});
  for (const p of ['', 'events']) assert.match((await live(cms, p)).html, /Join us today/);
  assert.strictEqual((await call('POST', `chapter/demo/item/sections/${sec.id}/delete`, {})).status, 400);
  assert.strictEqual((await call('POST', 'chapter/demo/items/sections', { title: 'Nested', blocks: [{ type: 'saved', props: { ref: sec.id } }] })).status, 400, 'no saved sections inside saved sections');
  // a page can't go live pointing at a saved section that won't be published
  const n = (await call('POST', 'chapter/demo/items/sections', { title: 'Draft one', blocks: [{ type: 'divider', props: {} }] })).body;
  const p = (await call('GET', 'chapter/demo/page/about')).body;
  p.page.blocks.push({ type: 'saved', props: { ref: n.id } });
  await call('PUT', 'chapter/demo/page/about', { page: p.page, baseRev: p.rev });
  const r = await call('POST', 'chapter/demo/publish', { items: ['page:about'] });
  assert.strictEqual(r.status, 422);
  assert.strictEqual((await call('POST', 'chapter/demo/publish', { items: ['page:about', `item:sections/${n.id}`] })).status, 200);
});

test('block visibility: between dates, phones or computers only, until an event is over (B4)', async () => {
  const { cms, call, clock } = setup({ at: AT });
  const p = (await call('GET', 'chapter/demo/page/about')).body;
  p.page.blocks.push({ type: 'text', props: { heading: 'FLASH-SALE', body: 'x' }, vis: { from: '2026-10-20T09:00', until: '2026-10-21T00:00' } });
  p.page.blocks.push({ type: 'text', props: { heading: 'PHONES-ONLY', body: 'x' }, vis: { device: 'Phones only' } });
  p.page.blocks.push({ type: 'text', props: { heading: 'UNTIL-DRIVE', body: 'x' }, vis: { after: 'voter-registration-drive' } });
  await call('PUT', 'chapter/demo/page/about', { page: p.page, baseRev: p.rev });
  await call('POST', 'chapter/demo/publish', {});
  let h = (await live(cms, 'about')).html;
  assert.ok(!h.includes('FLASH-SALE')); assert.match(h, /class="only-phone"><section[^]*PHONES-ONLY/); assert.match(h, /UNTIL-DRIVE/);
  const ed = await cms.renderPreview('demo', { ...p.page, page: 'about', edit: true });
  assert.match(ed, /hiddenblk[^]*Hidden until/, 'editors still see hidden sections, labelled');
  clock.tick(6 * 864e5); // Oct 20, noon
  assert.match((await live(cms, 'about')).html, /FLASH-SALE/);
  clock.tick(5 * 864e5); // Oct 25: the drive (Oct 24) is over
  h = (await live(cms, 'about')).html;
  assert.ok(!h.includes('FLASH-SALE') && !h.includes('UNTIL-DRIVE'));
});

test('themes restyle every page without touching content (T1, T2)', async () => {
  const { cms, call, store } = setup({ at: AT });
  const before = JSON.stringify(await store.get('demo', 'page/home'));
  const g = (await call('GET', 'chapter/demo/site')).body;
  g.site.theme = { ...g.site.theme, style: 'riso', palette: 'teal', fonts: 'system' };
  await call('PUT', 'chapter/demo/site', { site: g.site, baseRev: g.rev });
  await call('POST', 'chapter/demo/publish', {});
  const h = (await live(cms, '')).html;
  assert.match(h, /<body class="style-riso">/); assert.match(h, /--ch:#00ABBF/); assert.match(h, /--font-body:system-ui/); assert.ok(!h.includes('fonts.googleapis'));
  assert.strictEqual(JSON.stringify(await store.get('demo', 'page/home')), before, 'no page changed');
  // custom colours only when national allows them
  g.site.theme = { ...g.site.theme, palette: 'custom', accent: '#123456', primary: '#2C3659' };
  await call('PUT', 'chapter/demo/site', { site: g.site });
  assert.ok((await call('POST', 'chapter/demo/checks', {})).body.site.some((c) => /custom colours/.test(c.msg)));
  await call('PUT', 'national', { features: { demo: { endorsements: true, custom_colors: true } } });
  assert.ok(!(await call('POST', 'chapter/demo/checks', {})).body.site.some((c) => /custom colours/.test(c.msg)));
  await call('POST', 'chapter/demo/publish', {});
  assert.match((await live(cms, '')).html, /--ch:#123456/);
});

test('every design has a stylesheet section, loads its own font and keeps chapter colours readable (T1)', async () => {
  const T = require('../lib/theme');
  const css = require('fs').readFileSync(require('path').join(__dirname, '../static/site.css'), 'utf8');
  const val = (vars, name) => new RegExp(`--${name}:(#[0-9a-f]{6})`, 'i').exec(vars)[1];
  for (const id of ['masterplan', 'riso', 'skyline', 'blockparty', 'midrise']) assert.ok(T.DESIGNS[id], `${id} is offered`);
  for (const [id, d] of Object.entries(T.DESIGNS)) {
    assert.ok(d.name && d.hint && /^#[0-9a-f]{6}$/i.test(d.ground), `${id} has a name, a hint for the picker and a ground colour`);
    assert.ok(css.includes(`.style-${id}{`) || css.includes(`.style-${id} `), `${id} has a section in static/site.css`);
    // the picked design reaches the page, with its font; the system pairing loads nothing from the network
    const data = seed(); data.demo.site.theme = { ...data.demo.site.theme, style: id, palette: 'green', fonts: 'archivo' };
    let h = (await live(setup({ at: AT, data }).cms, '')).html;
    assert.match(h, new RegExp(`<body class="style-${id}">`)); assert.match(h, /--ch:#3E7B4F/);
    if (d.extra) assert.ok(h.includes(d.extra.replace(/&/g, '&amp;')), `${id} loads its extra font`);
    data.demo.site.theme.fonts = 'system';
    h = (await live(setup({ at: AT, data }).cms, '')).html;
    assert.match(h, new RegExp(`<body class="style-${id}">`)); assert.ok(!h.includes('fonts.googleapis'), `${id} loads no web fonts with the system pairing`);
    // whatever colours a chapter gets, the derived text colours pass on this design's ground and on dark panels
    for (const pal of [...T.PALETTES, { id: 'pale', primary: '#2C3659', accent: '#FFE27A' }, { id: 'dark', primary: '#1d2a22', accent: '#14324a' }]) {
      const vars = T.themeVars({ style: id, primary: pal.primary, accent: pal.accent, font: T.FONTS[0] });
      assert.ok(T.contrast(val(vars, 'ch-text'), d.ground) >= 4.5, `${id}/${pal.id}: chapter-colour text on the page`);
      assert.ok(T.contrast(val(vars, 'ch-lite'), pal.primary) >= 4.5, `${id}/${pal.id}: chapter-colour text on dark panels`);
      assert.ok(T.contrast(val(vars, 'on-ch'), pal.accent) >= 3, `${id}/${pal.id}: text on the chapter colour`);
    }
  }
  // an unknown or retired design name falls back to the default
  assert.strictEqual(T.styleId('yard'), T.DEFAULT_STYLE);
});

test('identity kit: logos wait for national approval; favicon and share image have defaults (T5)', async () => {
  const { cms, call } = setup({ at: AT });
  let h = (await live(cms, '')).html;
  assert.match(h, /<link rel="icon" href="data:image\/svg\+xml,/, 'a generated favicon');
  const g = (await call('GET', 'chapter/demo/site')).body;
  g.site.theme.logo = '/media/abcdefghijkm.png';
  const s = (await call('PUT', 'chapter/demo/site', { site: g.site, baseRev: g.rev })).body;
  assert.strictEqual(s.site.theme.logo, ''); assert.strictEqual(s.site.theme.logo_request, '/media/abcdefghijkm.png');
  await call('POST', 'chapter/demo/publish', {});
  assert.ok(!(await live(cms, '')).html.includes('abcdefghijkm'));
  assert.strictEqual((await call('GET', 'national')).body.chapters.find((c) => c.chapter === 'demo').logo_request, '/media/abcdefghijkm.png');
  await call('POST', 'national/logo/demo', { approve: true });
  h = (await live(cms, '')).html;
  assert.match(h, /class="brand" href="\/"><img src="\/media\/abcdefghijkm.png"/);
});

test('feature switches: national turns a collection off for a chapter (T7)', async () => {
  const { cms, call } = setup({ at: AT });
  await call('PUT', 'national', { features: { demo: { events: false, endorsements: true } } });
  assert.strictEqual((await live(cms, 'events/book-club-abundance')).status, 404);
  assert.ok(!(await live(cms, '')).html.includes('Book Club'), 'events sections hide');
  assert.strictEqual((await call('POST', 'chapter/demo/items/events', { title: 'X' })).status, 403);
  assert.strictEqual((await call('GET', 'chapter/demo')).body.features.events, false);
  const ed = await cms.renderPreview('demo', { ...(await call('GET', 'chapter/demo/page/home')).body.page, page: 'home', edit: true });
  assert.match(ed, /Events are turned off for this chapter by national/);
  assert.ok(!(await cms.contentApi('demo', '')).body.endpoints.includes('/api/v1/events'));
  // endorsements are off unless national turns them on
  await call('PUT', 'national', {});
  assert.strictEqual((await live(cms, 'endorsements/jordan-lee')).status, 404);
});

test('media: uploads are checked, served, described, and can only be deleted when unused (M1, M2)', async () => {
  const { cms, call } = setup({ at: AT });
  assert.strictEqual((await call('POST', 'chapter/demo/media', { data: Buffer.from('<svg onload=alert(1)>').toString('base64'), name: 'x.svg' })).status, 415, 'only real images');
  assert.strictEqual((await call('POST', 'chapter/demo/media', { data: '' })).status, 400);
  const m = (await call('POST', 'chapter/demo/media', { data: PNG, name: 'dot.jpg', w: 1, h: 1 })).body;
  assert.match(m.url, /^\/media\/[a-z0-9]{12}\.png$/, 'typed by its bytes, not its name'); assert.strictEqual(m.type, 'image/png');
  const f = await cms.mediaFile('demo', m.file);
  assert.strictEqual(Buffer.from(f.bytes).toString('base64'), PNG);
  assert.strictEqual(await cms.mediaFile('demo', '../site.json'), null);
  await call('POST', `chapter/demo/media/${m.id}`, { alt: 'A dot' });
  assert.strictEqual((await call('GET', 'chapter/demo/media')).body[0].alt, 'A dot');
  const g = (await call('GET', 'chapter/demo/item/people/sam-okafor')).body;
  g.item.photo = m.url;
  await call('PUT', 'chapter/demo/item/people/sam-okafor', { item: g.item, baseRev: g.rev });
  const del = await call('POST', `chapter/demo/media/${m.id}/delete`, {});
  assert.strictEqual(del.status, 409); assert.deepStrictEqual(del.body.usedOn, ['Sam Okafor']);
  g.item.photo = ''; await call('PUT', 'chapter/demo/item/people/sam-okafor', { item: g.item });
  assert.strictEqual((await call('POST', `chapter/demo/media/${m.id}/delete`, {})).status, 200);
  assert.strictEqual(await cms.mediaFile('demo', m.file), null);
  // the national library, shared by every chapter
  const n = (await call('POST', 'national/media', { data: PNG, name: 'logo.png' })).body;
  assert.match(n.url, /^\/media\/national\//);
  assert.strictEqual((await call('GET', 'national/media')).body.length, 1);
});

test('scheduled publish and unpublish run on time with the content as scheduled (W5)', async () => {
  const { cms, call, clock } = setup({ at: AT });
  const g = (await call('GET', 'chapter/demo/item/posts/we-registered-40-voters')).body;
  g.item.title = 'SCHEDULED-TITLE';
  await call('PUT', 'chapter/demo/item/posts/we-registered-40-voters', { item: g.item, baseRev: g.rev });
  assert.strictEqual((await call('POST', 'chapter/demo/schedule', { doc: 'item:posts/we-registered-40-voters', action: 'publish', at: '2026-10-14T09:00' })).status, 400, 'not in the past');
  const s = (await call('POST', 'chapter/demo/publish', { items: ['item:posts/we-registered-40-voters'], at: '2026-10-15T08:00' })).body;
  assert.strictEqual(s.scheduled.length, 1);
  g.item.title = 'LATER-EDIT';
  await call('PUT', 'chapter/demo/item/posts/we-registered-40-voters', { item: g.item });
  await call('POST', 'chapter/demo/schedule', { doc: 'page:issues', action: 'unpublish', at: '2026-10-15T08:00' });
  assert.ok(!(await live(cms, 'news')).html.includes('SCHEDULED-TITLE'));
  clock.tick(20 * 3600e3); // Oct 15, 8:00 in Chicago
  const h = (await live(cms, 'news')).html;
  assert.match(h, /SCHEDULED-TITLE/); assert.ok(!h.includes('LATER-EDIT'), 'later edits wait for the next publish');
  assert.strictEqual((await call('GET', 'chapter/demo/item/posts/we-registered-40-voters')).body.item.title, 'LATER-EDIT', 'and stay as a draft');
  assert.match((await live(cms, 'issues')).html, /<title>Issues ·/, 'the page is off; the automatic list shows');
  const list = (await call('GET', 'chapter/demo/schedule')).body;
  assert.strictEqual(list.items.length, 0); assert.deepStrictEqual(list.done.map((x) => x.result), ['Done', 'Done']);
  // scheduled versions show who scheduled them
  assert.ok((await call('GET', 'chapter/demo/versions/@posts-we-registered-40-voters')).body.some((v) => v.by === 'Sam (scheduled)'));
});

test('contact forms deliver to the inbox and never show a personal email (C5)', async () => {
  const { cms, call } = setup({ at: AT });
  const person = (await live(cms, 'people/alex-rivera')).html;
  assert.match(person, /<form class="contact"[^>]*action="\/contact"/); assert.match(person, /name="to" value="person:alex-rivera"/);
  for (const p of ['', 'people', 'people/alex-rivera', 'about']) assert.ok(!(await live(cms, p)).html.includes('alex@example.org'), p);
  assert.ok(!JSON.stringify((await cms.contentApi('demo', 'people')).body).includes('alex@example.org'));
  assert.ok(!(await live(cms, 'people/sam-okafor')).html.includes('<form'), 'no email, no form');
  assert.deepStrictEqual(await cms.contact('demo', { website: 'spam', name: 'Bot', email: 'b@b.co', message: 'hi' }), { ok: true });
  await assert.rejects(cms.contact('demo', { name: 'A', email: 'nope', message: 'hi' }), { status: 400 });
  await assert.rejects(cms.contact('demo', { name: 'A', email: 'a@b.co', message: 'hi', to: 'person:sam-okafor' }), { status: 400 });
  assert.strictEqual((await cms.contact('demo', { name: 'Ana', email: 'ana@b.co', message: 'Can I help?', to: 'person:alex-rivera' })).toName, 'Alex Rivera');
  const inbox = (await call('GET', 'chapter/demo/inbox')).body;
  assert.strictEqual(inbox.length, 1); assert.strictEqual(inbox[0].toName, 'Alex Rivera');
  assert.strictEqual((await call('GET', 'chapter/demo')).body.inbox, 1);
  await call('POST', `chapter/demo/inbox/${inbox[0].id}`, { done: true });
  assert.strictEqual((await call('GET', 'chapter/demo')).body.inbox, 0);
});

test('content API: published content only, private fields left out (F3)', async () => {
  const { cms, call } = setup({ at: AT });
  await call('POST', 'chapter/demo/items/events', { title: 'Secret draft' });
  const idx = (await cms.contentApi('demo', '')).body;
  assert.deepStrictEqual(idx.endpoints, ['/api/v1/pages', '/api/v1/events', '/api/v1/posts', '/api/v1/people', '/api/v1/endorsements', '/api/v1/issues']);
  const ev = (await cms.contentApi('demo', 'events')).body.items;
  assert.ok(!ev.some((e) => e.title === 'Secret draft'));
  assert.strictEqual(ev.find((e) => e.id === 'summer-picnic').past, true);
  assert.strictEqual(ev.find((e) => e.id === 'summer-picnic').page_url, '/events/summer-picnic');
  assert.strictEqual((await cms.contentApi('demo', 'news/why-demo-city-needs-more-homes')).body.type, 'Video', 'by collection name or address');
  assert.strictEqual((await cms.contentApi('demo', 'pages/home')).body.page_url, '/');
  assert.strictEqual((await cms.contentApi('demo', 'sections')).status, 404, 'saved sections are editor-only');
  assert.strictEqual((await cms.contentApi('demo', 'events/secret-draft')).status, 404);
  assert.strictEqual((await cms.contentApi('national', '')).status, 404);
});

test('templates start pages and items with the right sections, and placeholders block publishing (B2)', async () => {
  const { call } = setup({ at: AT });
  for (const [id, t] of Object.entries(templates)) {
    const r = t.kind === 'page' ? await call('POST', 'chapter/demo/pages', { title: t.label, template: id, addToMenu: false }) : await call('POST', `chapter/demo/items/${t.kind}`, { template: id });
    assert.strictEqual(r.status, 200, id);
    const doc = t.kind === 'page' ? (await call('GET', `chapter/demo/page/${r.body.slug}`)).body.page : (await call('GET', `chapter/demo/item/${t.kind}/${r.body.id}`)).body.item;
    assert.deepStrictEqual(doc.blocks.map((b) => b.type), t.blocks().map((b) => b.type), id);
    const c = (await call('POST', 'chapter/demo/checks', { doc: t.kind === 'page' ? r.body.slug : `@${t.kind}-${r.body.id}` })).body.page;
    assert.ok(c.some((x) => x.level === 'error' && /placeholder/.test(x.msg)), `${id}: placeholders flagged`);
  }
  const pr = (await call('POST', 'chapter/demo/items/posts', { template: 'press_release' })).body;
  assert.strictEqual((await call('GET', `chapter/demo/item/posts/${pr.id}`)).body.item.type, 'Press release');
  assert.strictEqual((await call('POST', 'chapter/demo/items/events', { template: 'campaign' })).status, 400, 'templates fit their kind');
});

test('lists never show an empty box: sign-up, national news, a message or nothing (R3)', async () => {
  const { cms, call } = setup({ at: '2027-06-01T17:00:00Z' }); // every demo event is over
  const page = (mode) => ({ title: 'T', blocks: [{ type: 'events_list', v: 2, props: { ...B.events_list.defaults, if_empty: mode, empty_text: 'EMPTY-TEXT' } }] });
  const render = async (mode) => cms.renderPreview('demo', { ...page(mode), page: 'x' });
  assert.match(await render('Show national news'), /The 2026 abundance agenda/);
  assert.match(await render('Show a message'), /EMPTY-TEXT/);
  assert.match(await render('Show a sign-up box'), /EMPTY-TEXT[^]*Join the list/);
  assert.ok(!(await render('Hide this section')).includes('<h2 class="sign">Upcoming'), 'hidden');
  const ed = await cms.renderPreview('demo', { ...page('Hide this section'), page: 'x', edit: true });
  assert.match(ed, /Nothing to show here right now/, 'editors are told why');
  assert.ok((await call('GET', 'chapter/demo')).status === 200);
});

test('versioned blocks: old saved props upgrade on save, new ones pass through (F2)', async () => {
  const { call } = setup({ at: AT });
  const p = (await call('GET', 'chapter/demo/page/about')).body;
  p.page.blocks.push({ type: 'button', props: { label: 'Go', url: '/events', style: 'Navy' } }); // a Stage 1 button
  const r = (await call('PUT', 'chapter/demo/page/about', { page: p.page, baseRev: p.rev })).body;
  const b = r.page.blocks[r.page.blocks.length - 1];
  assert.strictEqual(b.v, B.button.version);
  assert.ok(B.button.fields.find((f) => f.key === 'style').options.includes(b.props.style));
  const again = (await call('PUT', 'chapter/demo/page/about', { page: r.page, baseRev: r.rev })).body;
  assert.deepStrictEqual(again.page.blocks[again.page.blocks.length - 1], b, 'current blocks are left alone');
});
