import { expect, test } from './fixtures'

test('new tab opens the whiteboard', async ({ board }) => {
  await expect(board).toHaveTitle('New Tab')
  await expect(board.locator('[data-tool="sticky"]')).toBeVisible()
  await expect(board.locator('.empty-hint')).toBeVisible()
  const bg = await board.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(10, 10, 11)')
  expect(board.url()).toMatch(/^(chrome:\/\/newtab|chrome-extension:\/\/)/)
  await board.screenshot({ path: `${process.env.SHOT_DIR ?? 'test-results'}/empty.png` })
})
