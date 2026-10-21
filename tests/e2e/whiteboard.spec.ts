import {
  center,
  clickEmpty,
  dragMouse,
  errorsOf,
  expect,
  fontSizeOf,
  launch,
  openNewTab,
  storedElements,
  test,
} from './fixtures'

const SHOTS = process.env.SHOT_DIR ?? 'test-results/shots'

test('new tab opens the whiteboard in dark mode', async ({ board: page }) => {
  await expect(page).toHaveTitle('New Tab')
  // The tab icon is the browser's own product logo, served by the _favicon endpoint.
  const icon = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href
    const img = new Image()
    img.src = href
    await img.decode()
    return { href, width: img.naturalWidth }
  })
  expect(icon.href).toContain('/_favicon/?pageUrl=chrome%3A%2F%2Fversion%2F')
  expect(icon.width).toBeGreaterThan(0)
  await expect(page.locator('[data-tool="sticky"]')).toBeVisible()
  await expect(page.locator('.empty-hint')).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(10, 10, 11)')
})

test('sticky notes: create, type, recolour, text follows size, persists', async ({ board: page }) => {
  await page.click('[data-tool="sticky"]')
  await page.click('[aria-label="Mint sticky"]')
  await page.mouse.click(500, 400)
  await expect(page.locator('.sticky [data-editing]')).toBeFocused()
  await page.keyboard.type('Ship the MVP')
  await page.keyboard.press('Escape')

  const sticky = page.locator('.sticky')
  await expect(sticky).toHaveCount(1)
  await expect(sticky).toHaveText('Ship the MVP')
  await expect(sticky.locator('.sticky-paper')).toHaveCSS('background-color', 'rgb(155, 239, 184)')
  await expect(page.locator('.empty-hint')).toHaveCount(0)

  // Recolour from the context toolbar.
  await page.click('[data-testid="context-toolbar"] [data-color="Pink"]')
  await expect(sticky.locator('.sticky-paper')).toHaveCSS('background-color', 'rgb(249, 168, 212)')

  // Text grows when the note is enlarged and shrinks when it is reduced.
  const base = await fontSizeOf(page, '.sticky .item-text')
  const se = await center(page, '.handle.h-se')
  await dragMouse(page, se, { x: se.x + 200, y: se.y + 200 })
  const bigger = await fontSizeOf(page, '.sticky .item-text')
  expect(bigger).toBeGreaterThan(base * 1.5)
  const se2 = await center(page, '.handle.h-se')
  await dragMouse(page, se2, { x: se2.x - 300, y: se2.y - 300 })
  expect(await fontSizeOf(page, '.sticky .item-text')).toBeLessThan(base)

  const stored = await storedElements(page)
  expect(stored).toHaveLength(1)
  expect(stored[0]).toMatchObject({ type: 'sticky', text: 'Ship the MVP', color: '#F9A8D4', w: 100, h: 100 })

  await page.reload()
  await page.locator('main.app[data-loaded]').waitFor({ state: 'attached' })
  await expect(page.locator('.sticky')).toHaveText('Ship the MVP')
  await expect(page.locator('.sticky-paper')).toHaveCSS('background-color', 'rgb(249, 168, 212)')
})

test('text boxes scale their text with the box', async ({ board: page }) => {
  await page.mouse.dblclick(600, 300)
  await expect(page.locator('.text-item [data-editing]')).toBeFocused()
  await page.keyboard.type('Quarterly goals')
  await page.keyboard.press('Escape')

  const text = page.locator('.text-item')
  await expect(text).toHaveText('Quarterly goals')
  await expect(text).toHaveCSS('color', 'rgb(236, 231, 219)') // paper

  const size0 = await fontSizeOf(page, '.text-item')
  const box0 = (await text.boundingBox())!
  const se = await center(page, '.handle.h-se')
  await dragMouse(page, se, { x: se.x + box0.width, y: se.y + box0.height })

  const size1 = await fontSizeOf(page, '.text-item')
  const box1 = (await text.boundingBox())!
  expect(size1).toBeGreaterThan(size0 * 1.8)
  expect(box1.width).toBeGreaterThan(box0.width * 1.8)
  await expect(page.getByTestId('font-size')).toHaveText(String(Math.round(size1)))

  const se1 = await center(page, '.handle.h-se')
  await dragMouse(page, se1, { x: se1.x - box1.width * 0.7, y: se1.y - box1.height * 0.7 })
  expect(await fontSizeOf(page, '.text-item')).toBeLessThan(size0)

  // A side handle sets a wrapping width instead of scaling.
  await page.keyboard.press('ControlOrMeta+z')
  expect(await fontSizeOf(page, '.text-item')).toBeCloseTo(size1, 0)
  const e = await center(page, '.handle.h-e')
  await dragMouse(page, e, { x: e.x - box1.width * 0.5, y: e.y })
  expect(await fontSizeOf(page, '.text-item')).toBeCloseTo(size1, 0)
  const wrapped = (await text.boundingBox())!
  expect(wrapped.height).toBeGreaterThan(box1.height * 1.5)
})

test('flowchart: shapes, connectors, labels, arrows follow and cascade-delete', async ({ board: page }) => {
  await page.keyboard.press('r')
  await dragMouse(page, { x: 300, y: 300 }, { x: 480, y: 400 })
  await expect(page.locator('.shape-item [data-editing]')).toBeFocused()
  await page.keyboard.type('Start')
  await page.keyboard.press('Escape')

  await page.keyboard.press('d')
  await page.mouse.click(800, 350)
  await page.keyboard.type('Ready?')
  await page.keyboard.press('Escape')
  await expect(page.locator('.shape-item')).toHaveCount(2)
  await expect(page.locator('.shape-item polygon')).toHaveCount(1)

  // Hover the first shape to reveal its connection dots and drag from the right one.
  await clickEmpty(page)
  await page.mouse.move(390, 350)
  await expect(page.locator('.anchor[data-anchor="right"]')).toBeVisible()
  const dot = await center(page, '.anchor[data-anchor="right"]')
  await dragMouse(page, dot, { x: 800, y: 350 })
  await expect(page.locator('.connector-item')).toHaveCount(1)

  const els = await storedElements(page)
  const [start, decision] = els.filter((e) => e.type === 'shape')
  const conn = els.find((e) => e.type === 'connector')!
  expect(conn.from).toMatchObject({ id: start!.id, side: 'right' })
  expect(conn.to.id).toBe(decision!.id)
  expect(conn.endCap).toBe('arrow')

  // Double-click the line to label it.
  await clickEmpty(page)
  await page.mouse.dblclick(600, 350)
  await page.keyboard.type('go')
  await page.keyboard.press('Escape')
  await expect(page.locator('.connector-label')).toHaveText('go')

  // Moving the target drags the arrow along with it.
  await clickEmpty(page)
  const before = (await page.locator('.connector-item').boundingBox())!
  await dragMouse(page, { x: 800, y: 330 }, { x: 800, y: 630 })
  const after = (await page.locator('.connector-item').boundingBox())!
  expect(after.y + after.height).toBeGreaterThan(before.y + before.height + 200)

  await page.screenshot({ path: `${SHOTS}/flowchart.png` })

  // Deleting a shape removes arrows attached to it; undo brings both back.
  await page.keyboard.press('Backspace')
  await expect(page.locator('.shape-item')).toHaveCount(1)
  await expect(page.locator('.connector-item')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.shape-item')).toHaveCount(2)
  await expect(page.locator('.connector-item')).toHaveCount(1)
})

test('shape labels can be positioned on a 3×3 grid', async ({ board: page }) => {
  await page.keyboard.press('r')
  await dragMouse(page, { x: 400, y: 300 }, { x: 700, y: 500 })
  await page.keyboard.type('Top left')
  await page.keyboard.press('Escape')

  const label = page.locator('.shape-label')
  await expect(label).toHaveCSS('align-items', 'center')
  await expect(label.locator('.item-text')).toHaveCSS('text-align', 'center')

  await page.click('[aria-label="Text position"]')
  await page.click('[data-pos="top-left"]')
  await expect(label).toHaveCSS('align-items', 'flex-start')
  await expect(label.locator('.item-text')).toHaveCSS('text-align', 'left')
  const shape = (await page.locator('.shape-item').boundingBox())!
  const text = (await label.locator('.item-text').boundingBox())!
  expect(text.y - shape.y).toBeLessThan(20)

  await page.click('[data-pos="bottom-right"]')
  await expect(label).toHaveCSS('align-items', 'flex-end')
  await expect(label.locator('.item-text')).toHaveCSS('text-align', 'right')
  expect((await storedElements(page))[0]).toMatchObject({ align: 'right', valign: 'bottom' })

  await page.keyboard.press('ControlOrMeta+z')
  await expect(label).toHaveCSS('align-items', 'flex-start')
})

test('connection dots stay reachable and can be clicked to draw a line', async ({ board: page }) => {
  // Two boxes 40px apart, the way flowchart steps often sit.
  for (const x of [400, 620]) {
    await page.keyboard.press('r')
    await page.mouse.click(x, 400) // 180×100 boxes: 310..490 and 530..710
    await page.keyboard.press('Escape')
  }
  await clickEmpty(page)

  // Glide slowly out of the left box toward its right-hand dot: the neighbour
  // must not take the hover away on the way.
  await page.mouse.move(450, 400)
  const leftId = (await storedElements(page))[0]!.id
  for (let x = 452; x <= 504; x += 2) {
    await page.mouse.move(x, 400)
    await expect(page.locator(`.anchor[data-for="${leftId}"][data-anchor="right"]`)).toHaveCount(1)
  }

  // Click the dot (no drag), move to the other box, click again.
  await page.mouse.click(504, 400)
  await page.mouse.move(640, 420, { steps: 8 })
  await expect(page.locator('.connector-item')).toHaveCount(1)
  await page.mouse.click(640, 420)
  const conn = (await storedElements(page)).find((e) => e.type === 'connector')!
  expect(conn.from).toMatchObject({ id: leftId, side: 'right' })
  expect(conn.to.id).toBe((await storedElements(page)).filter((e) => e.type === 'shape')[1]!.id)

  // Esc abandons a line that is still following the pointer.
  await clickEmpty(page)
  await page.mouse.move(450, 400)
  await page.mouse.move(400, 470, { steps: 4 })
  const bottom = await center(page, `.anchor[data-for="${leftId}"][data-anchor="bottom"]`)
  await page.mouse.click(bottom.x, bottom.y)
  await page.mouse.move(400, 650, { steps: 6 })
  await expect(page.locator('.connector-item')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator('.connector-item')).toHaveCount(1)
})

test('pen strokes with undo and redo', async ({ board: page }) => {
  await page.keyboard.press('p')
  await page.click('[aria-label="Teal ink"]')
  await page.mouse.move(300, 600)
  await page.mouse.down()
  for (let i = 1; i <= 24; i++) await page.mouse.move(300 + i * 15, 600 + Math.sin(i / 3) * 40)
  await page.mouse.up()
  await expect(page.locator('.path-item')).toHaveCount(1)
  await expect(page.locator('.path-item path').last()).toHaveAttribute('stroke', '#2DD4BF')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.path-item')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.locator('.path-item')).toHaveCount(1)
})

test('marquee select, duplicate, copy/paste and delete', async ({ board: page }) => {
  for (const [x, label] of [
    [400, 'A'],
    [700, 'B'],
  ] as const) {
    await page.keyboard.press('s')
    await page.mouse.click(x, 300)
    await page.keyboard.type(label)
    await page.keyboard.press('Escape')
  }
  await clickEmpty(page)
  await dragMouse(page, { x: 250, y: 150 }, { x: 850, y: 450 })
  await expect(page.locator('.sel-outline')).toHaveCount(2)

  await page.keyboard.press('ControlOrMeta+d')
  await expect(page.locator('.sticky')).toHaveCount(4)
  await page.keyboard.press('Backspace')
  await expect(page.locator('.sticky')).toHaveCount(2)

  await page.locator('.sticky').first().click()
  await page.keyboard.press('ControlOrMeta+c')
  await page.mouse.move(600, 650)
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.locator('.sticky')).toHaveCount(3)
  await expect(page.locator('.sticky').last()).toHaveText('A')
})

test('help panel opens with ? and closes with Escape', async ({ board: page }) => {
  await page.keyboard.press('?')
  await expect(page.locator('.help')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.help')).toHaveCount(0)
})

test('open tabs stay in sync', async ({ context }) => {
  const a = await openNewTab(context)
  const b = await openNewTab(context)
  await a.bringToFront()
  await a.keyboard.press('s')
  await a.mouse.click(600, 400)
  await a.keyboard.type('From tab A')
  await a.keyboard.press('Escape')
  await expect(b.locator('.sticky')).toHaveText('From tab A')

  await b.bringToFront()
  await b.locator('.sticky').click()
  await b.keyboard.press('Backspace')
  await expect(a.locator('.sticky')).toHaveCount(0)
  expect([...errorsOf(a), ...errorsOf(b)]).toEqual([])
})

test('board and view survive a browser restart', async ({ userDataDir }) => {
  let context = await launch(userDataDir)
  let page = await openNewTab(context)
  await page.keyboard.press('s')
  await page.mouse.click(600, 400)
  await page.keyboard.type('Remember me')
  await page.keyboard.press('Escape')
  await page.click('[aria-label="Zoom in"]')
  await expect(page.getByTestId('zoom')).toHaveText('125%')
  await page.waitForTimeout(800) // the view is saved on a short debounce
  await context.close()

  context = await launch(userDataDir)
  page = await openNewTab(context)
  await expect(page.locator('.sticky')).toHaveText('Remember me')
  await expect(page.getByTestId('zoom')).toHaveText('125%')
  expect(errorsOf(page)).toEqual([])
  await context.close()
})

test('showcase board renders cleanly', async ({ board: page }) => {
  const colors = ['Yellow', 'Coral', 'Lilac', 'Aqua']
  const notes = ['Morning pages', 'Call the bank about the mortgage', 'Book flights', 'Ideas for Q4 roadmap planning']
  for (let i = 0; i < notes.length; i++) {
    await page.click('[data-tool="sticky"]')
    await page.click(`[aria-label="${colors[i]} sticky"]`)
    await page.mouse.click(260 + i * 230, 220)
    await page.keyboard.type(notes[i]!)
    await page.keyboard.press('Escape')
  }
  await page.mouse.dblclick(170, 500)
  await page.keyboard.type('This week')
  await page.keyboard.press('Escape')
  const se = await center(page, '.handle.h-se')
  await dragMouse(page, se, { x: se.x + 90, y: se.y + 30 })

  await page.keyboard.press('r')
  await page.mouse.click(560, 520)
  await page.keyboard.type('Draft')
  await page.keyboard.press('Escape')
  await page.keyboard.press('d')
  await page.mouse.click(860, 520)
  await page.keyboard.type('Approved?')
  await page.keyboard.press('Escape')
  await page.keyboard.press('o')
  await page.mouse.click(1160, 520)
  await page.keyboard.type('Ship')
  await page.keyboard.press('Escape')
  await clickEmpty(page)

  for (const [from, to] of [
    [{ x: 560, y: 520 }, { x: 860, y: 520 }],
    [{ x: 860, y: 520 }, { x: 1160, y: 520 }],
  ] as const) {
    await page.mouse.move(from.x, from.y)
    const dot = await center(page, '.anchor[data-anchor="right"]')
    await dragMouse(page, dot, to)
    await clickEmpty(page)
  }
  await page.keyboard.press('p')
  await page.mouse.move(470, 640)
  await page.mouse.down()
  for (let i = 1; i <= 30; i++) await page.mouse.move(470 + i * 10, 640 + Math.sin(i / 4) * 12)
  await page.mouse.up()
  await page.keyboard.press('v')

  await page.locator('.shape-item').nth(1).click()
  await page.screenshot({ path: `${SHOTS}/showcase.png` })
  await expect(page.locator('.sticky')).toHaveCount(4)
  await expect(page.locator('.connector-item')).toHaveCount(2)

  // Close-up of a note's peeled corner.
  const note = (await page.locator('.sticky').first().boundingBox())!
  await page.screenshot({ path: `${SHOTS}/sticky-corner.png`, clip: { x: note.x - 20, y: note.y - 20, width: 240, height: 240 } })
})
