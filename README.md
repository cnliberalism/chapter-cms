# Chapter CMS

A small block-based CMS for CNL chapter websites. Chapter leads enter their events, news, people, endorsements and issues once, then build pages by stacking pre-made sections that show them (plus text, photos, columns, FAQs, forms and more). Every item gets its own page with a clean link. The public site renders in one of five designs, picked per site under Settings, Look, in colours national approves: "Master Plan" and "Riso Zine" (rows B and E of the CNL Chapter Sites design-directions canvas), "Skyline", "Block Party" and "Mid-Rise". No dependencies: just Node 20+.

## Run it

```bash
npm start                 # http://localhost:3000 (site)   http://localhost:3000/admin (editor)
npm test                  # unit, API and server tests
npm run test:visual       # screenshot checks (needs Playwright, see below)
npm run demo              # build chapter-editor-demo.html, a single-file demo that runs without a server
node new-chapter.js austin "Austin Chapter"   # copy the demo chapter as a starting point
```

In dev (`NODE_ENV` unset) the admin is open. For anything shared, set:

| Env var | Purpose |
|---|---|
| `NODE_ENV=production` | refuses to start without `ADMIN_PASSWORD` |
| `ADMIN_PASSWORD` | one shared password (HTTP Basic, any username) protecting `/admin` and the write API |
| `BASE_DOMAIN` | e.g. `cnliberalism.org`: `austin.cnliberalism.org` serves chapter `austin` |
| `DEFAULT_CHAPTER` | chapter served when no subdomain matches (default `demo`); in dev `?chapter=slug` also works |
| `DATA_DIR`, `PORT` | storage folder, port |

## How editing works

The page preview is the editor. Leads click any text to type over it, and everything else hangs off that:

- **Saving.** Edits save as a draft about a second after typing stops. The header shows "Saved · 2 unpublished" or "Saved · all live". Undo and redo cover typing, moves, deletes and settings (Ctrl+Z, Ctrl+Shift+Z).
- **Formatting.** Rich text fields get a small bar with bold, italic, link, list and subheading. Tab moves to the next field. Pasting drops outside formatting.
- **Sections.** Each section and column block has a toolbar to drag (⠿), move, duplicate or delete. "Add a section here" sits between sections and opens the block gallery.
- **Side panel.** Shows guidance for the field you're in, prewritten options, the section's settings and list items. On phones it becomes a bottom sheet, with a bar for undo, previous and next section, and publish.
- **Content.** One screen with a tab per kind of content: pages, events, news and posts, people, endorsements, issues and saved sections. Each item is entered once and shows everywhere a section lists it, and each has its own page (`/events/zoning-hearing`) that is edited like any page: text on the page, dates and links in the side panel, extra sections below. Past events move to `/events/archive`, endorsements to `/endorsements/results` after the election, and former leads to the alumni list, all on their own. Lists hide themselves (or show a message) when empty. With no page at `/events`, `/news`, `/people` or `/issues`, an automatic list page appears there.
- **Pages.** Create (from a blank page or a template: campaign, volunteer drive, voter guide), duplicate, rename, unpublish, delete (to a restorable trash) and set the homepage. Posts, endorsements and issues have templates too.
- **Issue tags.** Events, posts and endorsements are tagged with issues, and each issue page lists everything tagged with it.
- **Saved sections.** Any section can be saved for reuse. Edit it once and every page that uses it updates; "Turn into a separate copy" detaches one page's copy.
- **When to show a section.** Show a section between two dates, only on phones or computers, or until an event is over. Hidden sections stay in the editor, dimmed.
- **Photos.** Uploads shrink in the browser (at most 2000px, compressed) and the server checks what the file really is. Each chapter has a media library, and a national library is shared with every chapter. On phones the camera opens directly. Alt text written once in the library fills in wherever the photo is used.
- **Settings.** Chapter basics, the look (style, an approved colour set and fonts; changing it never touches content), logo and identity (a new logo waits for national's approval; without a favicon the chapter's initials are used, and a share image can be made from the chapter name in one tap), menu, announcement bar (with start and end dates), footer, connections (Action Network, Luma) and social links. Changes preview live and publish like pages.
- **Contact forms.** Visitors message the chapter or a person without seeing anyone's email address. Messages land under More, Messages (rate-limited, with a spam trap).
- **Scheduling.** Publish later from the publish dialog, or schedule a page to publish or unpublish under its Schedule button. What goes live is what was saved when it was scheduled.
- **National settings.** Approved colour sets (each checked for contrast) and fonts, logo approvals, the national media library, and feature switches (events, posts, people, issues, endorsements, contact forms, custom colours) by default or per chapter. A switched-off feature disappears from the editor and the site. Until logins arrive (Stage 4) this screen is open to anyone with editor access.
- **Publishing.** The publish dialog lists every unpublished page and site change with a summary, so a lead can publish one item or everything. Pre-publish checks run first: errors (a missing required field, a broken link, an image without alt text) block publishing, and warnings (vague link text, leftover starter text, low color contrast) advise. Most issues have "Show me" and many have "Fix it".
- **History.** Every page and the site settings keep versions: who and when, named versions, compare with the current draft word by word, and restore. The site timeline can restore the whole site as it was at a past publish (restored as drafts, so nothing changes until you publish).
- **Sharing.** A preview link shows a page with its unpublished changes to anyone, for 7 days, marked noindex. Links can be revoked.
- **Two editors at once.** The header shows who else is on the page. If someone saves first, the editor asks which version to keep, and the other one is kept in History.

## How it works

- **Store.** `lib/store.js` (files) and `lib/memstore.js` (memory, used by tests and the demo) share one tiny key-value interface: `get`, `put`, `del`, `list(prefix/)`, `chapters()`, plus `putBlob`, `getBlob`, `delBlob` for uploaded files. Moving to Cloudflare means writing that interface on KV and R2 or D1. Keys per chapter: `site`, `site-draft`, `page/<slug>`, `draft/<slug>`, `item/<collection>/<id>`, `idraft/<collection>/<id>`, `ver/<doc>/<id>`, `verindex/<doc>`, `trash/<id>`, `shares`, `schedule`, `media/<id>` (with the file at `blob/<id>`), `inbox/<id>` and `meta` (the content schema version). On disk a key is `data/<chapter>/<key>.json` (`.bin` for files). The reserved `national` chapter holds `config` (approved looks, feature switches), its media library and posts shared with every chapter.
- **Core.** `lib/cms.js` holds the rules: drafts, publishing, versions, trash, share links, schedules, media, messages and checks, for pages and items alike. Every doc carries `rev`, `updated_at` and `updated_by`; a save sends the rev it started from and gets a 409 with the current doc when someone else saved first.
- **Collections.** `lib/collections.js` defines each kind of content (fields, sort order, item page, related lists) the way `lib/blocks.js` defines blocks; `lib/fields.js` cleans fields for both. A section that lists content (`view: 'events'`) gets the chapter's items at render time, so one edit shows everywhere.
- **Looks.** `lib/theme.js` turns a chapter's style, colour set and fonts into CSS variables and checks contrast. Blocks store words and choices, never colours or fonts, so a restyle changes no content. `lib/national.js` holds national's settings and feature switches; `lib/templates.js` the starter pages.
- **Upgrades.** Blocks carry a schema `version`; older props are upgraded by `migrations[n]` when read, so old pages and versions keep working. A chapter whose data predates collections is upgraded once on first use: lists inside sections move into the shared collections (matched, never duplicated, order kept).
- **Content API.** `GET /api/v1` lists endpoints; `/api/v1/pages`, `/api/v1/events`, `/api/v1/news` (and the other collections, by name or path) list published content, and `/api/v1/<kind>/<id>` returns one item. Read-only, published content only, private fields (like emails) left out, open to other sites (CORS).
- **API.** `lib/api.js` maps `/admin/api/*` requests to the core and doesn't depend on a web server. `server.js` adds auth, CSRF checks (JSON content type and same origin on writes) and the public site. The demo calls the same `handle()` from a fetch shim.
- **Checks.** `lib/checks.js` checks a page or the site settings and returns issues with where they are and, when possible, a one-tap fix.
- **Rendering.** `lib/render.js` wraps blocks in the site chrome (announcement bar, menu, footer). Everything is escaped, and links are limited to `http(s)`, `mailto:` and relative paths. Rich text fields accept `**bold**`, `_italic_`, `[link](https://…)`, `- lists` and `### subheadings`.
- **Editor.** `admin/` is plain browser scripts with no build step: `util.js`, `editor.js` (state, autosave, undo, presence), `panel.js` (side panel and settings), `screens.js` (pages, publish, history, share), `boot.js`. `frame.js` and `frame.css` run inside the preview and talk to the editor with `postMessage`.

## Adding a block

Add one entry to `lib/blocks.js`. The entry is the whole contract: the editor, validation, checks, the block gallery and the tests all read it.

```js
volunteer_form: {
  label: 'Volunteer form',                 // name leads see
  help: 'Collect names for a shift.',      // one sentence, shown in the gallery
  fields: [
    { key: 'heading', label: 'Heading', kind: 'text', max: 50, required: true },
    { key: 'body', label: 'Intro', kind: 'textarea', rich: true, max: 400, hint: 'Say what the shift involves.' },
    { key: 'form_url', label: 'Form link', kind: 'url', fallback: 'action_network_url' },
  ],
  defaults: { heading: 'Volunteer with us', body: '', form_url: '' },
  render: (p, c) => `<section class="wrap block"><h2${c.f('heading')}>${esc(p.heading)}</h2>${body(c, c.f('body'), p.body)}</section>`,
},
```

- **Field kinds:** `text`, `textarea`, `url`, `image`, `date`, `select`, `tags` and `ref` (items of a collection), `list` (with sub-`fields`).
- **Field options:** `options` (prewritten copy), `rich`, `max`, `maxLines`, `required`, `hint`, `panel` (edit in the side panel), `fallback` (a Settings > Connections key).
- **Block options:** `presets` (one-tap list items), `sample` (gallery content), `atom: true` (can also sit inside a column), `view` (lists a collection), `feature` (hidden when that feature is off), `version` with `migrations` (when props change shape).
- **Render:** escape everything with `esc`, pass links through `safeUrl`, and mark editable text with `c.f(key)` or `c.fi(list, j, key)`, which return nothing on the public site. Rich text goes through the `body(c, attrs, text)` helper.
- **Styles:** go in `static/site.css`; blocks only emit class names.

`test/blocks.test.js` runs every block through the contract, including rendering hostile text, so a new block is tested as soon as it is registered. Then run `UPDATE_SNAPSHOTS=1 npm run test:visual` to add it to the screenshot baselines.

## Tests

- `npm test` covers the block contract, the core (drafts, conflicts, publishing, versions, restore, shares, checks, presence), the content model (migration, items, item pages and archives, tags, saved sections, visibility, looks, logo approval, feature switches, media, schedules, contact forms, the content API, templates, fallbacks, block upgrades), file-store safety and the HTTP server (auth, CSRF, attribution, share links, media files, contact forms, the content API).
- `npm run test:visual` renders the block gallery and demo pages (home, about, an event page, the automatic people list) at desktop and phone widths in headless Chromium and compares them with `test/visual/baseline/`. It also fails if a page scrolls sideways on a phone. It needs Playwright (`npm i -D playwright && npx playwright install chromium`, or `NODE_PATH` pointing at a global install) and skips itself otherwise. Fallback fonts differ between machines, so make baselines where they're checked.

## Not done yet (deliberately)

- Cloudflare deploy, logins and roles (the editor asks for a name for now, and national settings are open to every editor), multisite management, Luma and Action Network syncs, email delivery of contact messages (they wait in Messages).
- Dates are stored as local wall-clock times in the chapter's timezone.
- Five designs: Master Plan, Riso Zine, Skyline (an Art Deco city at night), Block Party (a city of circles, arches and triangles under bunting) and Mid-Rise (the page is a building and every section is a floor). Blocks output the same markup for all of them; each design shows or hides its own decorations (the hero map, tape, ovals, the event calendar). Typekit Pragmatica Extended is not loaded, so Archivo from Google Fonts stands in. A design can load one more font whatever pairing is picked: Permanent Marker for Riso Zine's notes, Josefin Sans, Jost and Fraunces for the display type of the other three (with the system pairing nothing is loaded and they use the pairing's fonts).
- All five designs ship in the one `static/site.css` (about 123 KB, 25 KB gzipped). If more are added, serving each design's section as its own file would keep pages from loading the designs they don't use.
- A new design goes in `static/site.css` under a `.style-<name>` class and in `DESIGNS` in `lib/theme.js`, and changes no block markup. Take colours from the theme variables (`--ch`, `--navy`, `--on-ch`, `--ch-text`, `--ch-tint`, `--ch-deep`, `--ch-lite`) so any chapter palette works; drawings are SVG masks filled with those variables. Don't put `::before` on text a chapter lead edits (the editor uses it for placeholders), and check the design in the editor too, where every section sits inside a wrapper with an "add section" bar between sections.
