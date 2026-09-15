import { expect, test, type Page } from '@playwright/test'

async function openSession(page: Page) {
  await page.goto('/sessions/python-1')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('session-shell')).toBeVisible()
}

test('learner can enter Python Session 1 from the Spark Journey hub', async ({ page }) => {
  await page.goto('/spark-journey')

  await expect(page.getByTestId('spark-journey-hub')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose your learning path' })).toBeVisible()
  await page.getByTestId('open-python-session').click()

  await expect(page.getByTestId('session-shell')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Python Coding · Session 1/ })).toBeVisible()
})

test('guided progression locks later levels and Explore all levels unlocks inspection only', async ({ page }) => {
  await openSession(page)

  await expect(page.getByTestId('level-1')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('level-2')).toBeDisabled()
  await expect(page.getByTestId('level-3')).toBeDisabled()

  await page.getByTestId('session-settings').click()
  await page.getByTestId('mode-explore').check()
  await page.getByTestId('session-settings').click()
  await expect(page.getByTestId('level-4')).toBeEnabled()
  await page.getByTestId('level-4').click()
  await expect(page.getByTestId('level-4')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('heading', { name: 'Output accuracy' })).toBeVisible()
})

test('language and progression settings persist across refresh', async ({ page }) => {
  await openSession(page)
  await page.getByTestId('session-settings').click()
  await page.getByTestId('language-th').click()
  await page.getByTestId('mode-explore').check()
  await page.reload()

  await expect(page.getByRole('heading', { name: 'คำสั่ง print แรกของคุณ' })).toBeVisible()
  await page.getByTestId('session-settings').click()
  await expect(page.getByTestId('language-th')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('mode-explore')).toBeChecked()
})

test('Reset Session Progress returns the learner to the first locked path', async ({ page }) => {
  await openSession(page)
  await page.getByTestId('session-settings').click()
  await page.getByTestId('mode-explore').check()
  await page.getByTestId('session-settings').click()
  await page.getByTestId('level-4').click()
  await page.getByTestId('session-settings').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('reset-progress').click()
  await page.reload()
  await expect(page.getByTestId('level-1')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('level-2')).toBeDisabled()
  await expect(page.getByTestId('level-4')).toBeDisabled()
})
