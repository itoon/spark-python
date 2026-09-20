import { expect, test } from '@playwright/test'

test('keeps the debug bubble next to the active code line', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(page.locator('.editor-meta')).toHaveText('Runtime: ready', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Debug file' }).click()
  await expect(page.getByRole('button', { name: /Next step/ })).toBeEnabled({
    timeout: 120_000,
  })
  await page.getByRole('button', { name: /Next step/ }).click()
  await expect(page.locator('.step-label')).toContainText('Step 2 /')
  await page.getByRole('button', { name: /Next step/ }).click()
  await expect(page.locator('.step-label')).toContainText('Step 3 /')

  const bubble = page.locator('[data-testid="debug-step-bubble"]')
  const activeLine = page.locator('.debug-current-line')
  await expect(bubble).toBeVisible()
  await expect(activeLine).toBeVisible()
  await expect(bubble).not.toContainText('Store the new value')
  await expect(bubble.locator('.debug-bubble-value')).toBeVisible()

  const bubbleBox = await bubble.boundingBox()
  const lineBox = await activeLine.boundingBox()
  expect(bubbleBox).not.toBeNull()
  expect(lineBox).not.toBeNull()
  expect(Math.abs((bubbleBox?.y || 0) - (lineBox?.y || 0))).toBeLessThan(140)
})
