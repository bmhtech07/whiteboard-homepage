# Whiteboard Tab

A dark, minimal whiteboard that replaces Chrome's new tab page. Whatever you leave on the board is there the next time you open a tab or restart Chrome.

Built with Nuxt 4 (client-only SPA) and packaged as a Manifest V3 extension.

## Run it

Requires Node 22.21+ or 24.11+ (older versions work but Nuxt prints a warning).

```bash
npm install
npm run build        # outputs the extension to dist/
```

Then in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `dist` folder.
3. Open a new tab. If Chrome asks whether to keep the changed new tab page, choose **Keep it**.

To see the board when Chrome starts, go to **Settings → On startup → Open the New Tab page**.

After changing the code, run `npm run build` again and click the reload icon on the extension's card in `chrome://extensions`. Your board is kept: the manifest pins the extension ID, so the stored data stays attached even if you move the folder.

### Develop in a normal tab

```bash
npm run dev          # http://localhost:3000
```

Dev mode stores the board in `localStorage`, so it is separate from the extension's board.

## What it does

- **Sticky notes** (`S`) in 10 colours. Text fills the note and grows or shrinks as you resize it.
- **Text** (`T`, or double-click the canvas). Dragging a corner scales the text with the box. Dragging a side sets a wrapping width.
- **Shapes** (`R` rectangle, `O` ellipse, `D` diamond) with labels, border colour and fill.
- **Arrows** (`L`, or drag from a blue dot on a shape or note, or click a dot and then click the target; Esc cancels). Arrows stay attached when shapes move. They can be straight, elbow or curved, dashed, single or double-headed, and labelled (double-click the line).
- **Pen** (`P`) for freehand drawing.
- Undo/redo, duplicate (`⌘D` or Alt-drag), copy/paste, marquee selection, layering (`[` `]`), zoom and pan (scroll, pinch, Space-drag), fit to content (`⇧1`). Press `?` for the full list.

The board autosaves to `chrome.storage.local`. Open new-tab pages stay in sync with each other.

**Back up your board:** use **Menu → Export board…** to save a JSON file, and **Import board…** to restore it. Uninstalling the extension deletes its stored data.

## Tests

```bash
npm test                         # unit tests (Vitest): geometry, text fitting, history, store, persistence
npx playwright install chromium  # once
npm run test:e2e                 # builds, then drives the real extension in Chromium
```

The end-to-end tests load `dist/` into Chromium, open `chrome://newtab`, and cover: notes, text scaling, flowcharts and connectors, pen, undo/redo, clipboard, cross-tab sync, persistence across a browser restart, and no console/CSP errors.

## How the build works

`nuxt generate` produces a static SPA in `.output/public`. Then `scripts/build-extension.mjs` turns it into an extension:

- moves Nuxt's inline config `<script>` into `boot.js`, because extension pages only allow scripts loaded from files;
- writes `manifest.json` (new tab override, `storage` permission, pinned key);
- checks for anything Chrome would refuse to load: paths starting with `_`, leftover inline scripts, missing icons.

`nuxt.config.ts` also renames Nuxt's `/_nuxt/` folder, prefixes chunk names, and turns off the inline import map, for the same reasons.

## Layout

```
app/
  app.vue                 page shell; loads and saves the board
  components/             canvas, element renderers, toolbars, menus
  composables/            shared store, editing, shortcuts, actions
  utils/                  framework-free logic (geometry, store, history, persistence)
scripts/                  extension packaging and icon generation
tests/unit, tests/e2e     Vitest and Playwright suites
```
