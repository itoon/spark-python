import { expect, test } from '@playwright/test'

test('debug starts paused and only prints as you continue', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(page.locator('.editor-meta')).toHaveText('Runtime: ready', {
    timeout: 120_000,
  })

  await page.getByRole('button', { name: 'Debug file' }).click()
  await expect(page.locator('.step-label')).toContainText('Paused • Step 1 /', {
    timeout: 120_000,
  })
  await expect(page.locator('.editor-meta')).toContainText('Paused')
  await expect(page.locator('.console-output')).not.toContainText(
    'Live debugging needs an isolated page',
  )
  await expect(page.locator('.console-output')).not.toContainText('Spark Coding Lab')

  await page.getByRole('button', { name: /Next step/ }).click()
  await expect(page.locator('.console-output')).not.toContainText('Spark Coding Lab')

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.step-label')).toContainText('Program finished')
  await expect(page.locator('.console-output')).toContainText('Spark Coding Lab')
  await expect(page.getByTestId('debug-step-bubble')).toBeHidden()
})
