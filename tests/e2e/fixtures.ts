import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test'

export const extensionPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist')

const manifest = JSON.parse(readFileSync(join(extensionPath, 'manifest.json'), 'utf8'))
export const extensionId = createHash('sha256')
  .update(Buffer.from(manifest.key, 'base64'))
  .digest('hex')
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)))

export function launch(userDataDir: string) {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !process.env.HEADED,
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
}

/** Console errors and uncaught exceptions per page (CSP violations show up here). */
const pageErrors = new WeakMap<Page, string[]>()

export async function openNewTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('chrome://newtab/')
  await page.locator('main.app[data-loaded]').waitFor({ state: 'attached' })
  return page
}

export const errorsOf = (page: Page) => pageErrors.get(page) ?? []

export const test = base.extend<{ userDataDir: string; context: BrowserContext; board: Page }>({
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'whiteboard-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  context: async ({ userDataDir }, use) => {
    const context = await launch(userDataDir)
    await use(context)
    await context.close()
  },
  board: async ({ context }, use) => {
    const page = await openNewTab(context)
    await use(page)
    expect(errorsOf(page), 'console errors').toEqual([])
  },
})

export { expect }

// ------------------------------------------------------------------ helpers

export async function dragMouse(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}

export async function center(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

/** The board as persisted in chrome.storage.local. */
export async function storedElements(page: Page): Promise<Array<Record<string, any>>> {
  return page.evaluate(async () => {
    const res = await chrome.storage.local.get('whiteboard:board')
    return (res['whiteboard:board']?.elements ?? []) as Array<Record<string, any>>
  })
}

export async function fontSizeOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
}

/** Clicks an empty spot so nothing is selected or being edited. */
export async function clickEmpty(page: Page, x = 1200, y = 120) {
  await page.mouse.click(x, y)
}
