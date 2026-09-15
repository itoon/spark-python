import { expect, test, type Page } from '@playwright/test'

async function openSession(page: Page) {
  await page.goto('/sessions/python-1')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('session-shell')).toBeVisible()
}

async function enableExploreMode(page: Page) {
  await page.getByTestId('session-settings').click()
  await page.getByTestId('mode-explore').check()
  await page.getByTestId('session-settings').click()
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
  await expect(page.getByTestId('stage-predict')).toBeDisabled()
  await expect(page.getByTestId('stage-code')).toBeDisabled()
  await expect(page.getByTestId('stage-test')).toBeDisabled()
  await page.getByTestId('play-run').click()
  await expect(page.getByTestId('stage-predict')).toBeEnabled()

  await page.getByTestId('session-settings').click()
  await page.getByTestId('mode-explore').check()
  await page.getByTestId('session-settings').click()
  await expect(page.getByTestId('level-4')).toBeEnabled()
  await page.getByTestId('level-4').click()
  await expect(page.getByTestId('level-4')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('heading', { name: 'Output accuracy' })).toBeVisible()
  await expect(page).toHaveURL(/level=level-4/)
  await page.reload()
  await expect(page.getByTestId('level-4')).toHaveAttribute('aria-current', 'step')
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

test('Reset Session Progress clears the selection while preserving settings', async ({ page }) => {
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
  await expect(page.getByTestId('level-4')).toBeEnabled()
  await page.getByTestId('session-settings').click()
  await expect(page.getByTestId('mode-explore')).toBeChecked()
})

test('learner can complete the Level 1 print Mission and keep mastery after refresh', async ({ page }) => {
  await openSession(page)

  await expect(page.getByTestId('play-stage')).toBeVisible()
  await expect(page.getByTestId('play-run')).toBeEnabled()
  await page.getByTestId('play-run').click()
  await expect(page.getByTestId('play-output')).toContainText('Hello World')
  await page.getByTestId('continue-to-predict').click()

  await page.getByTestId('predict-option-message').check()
  await page.getByTestId('predict-submit').click()
  await expect(page.getByTestId('predict-feedback')).toContainText('Correct')
  await page.getByTestId('continue-to-code').click()

  await expect(page.getByTestId('code-workspace')).toBeVisible()
  await expect(page.getByTestId('run-code')).toBeEnabled()
  await page.getByTestId('run-code').click()
  await expect(page.getByTestId('code-result')).toContainText('Hello World')
  await page.getByTestId('continue-to-test').click()

  await expect(page.getByTestId('test-code')).toBeEnabled()
  await page.getByTestId('test-code').click()
  await expect(page.getByTestId('test-case-hello-world')).toContainText('PASS')
  await expect(page.getByTestId('mastery-banner')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('level-2')).toBeEnabled()
})

test('Level 1 Test reports exact output differences and offers a progressive hint', async ({ page }) => {
  await openSession(page)
  await enableExploreMode(page)
  await page.getByTestId('stage-code').click()

  const editor = page.getByRole('textbox', { name: 'Python code editor' })
  await expect(editor).toBeVisible()
  await editor.focus()
  await editor.press('Control+A')
  await editor.press('Backspace')
  await editor.type('print("Hello  World")')
  await page.getByTestId('stage-test').click()
  const result = page.getByTestId('test-case-hello-world')
  await expect(result).toContainText('—')
  await expect(page.getByTestId('test-code')).toBeEnabled()
  await page.getByTestId('test-code').click()

  await expect(result).toContainText('FAIL')
  await expect(result).toContainText('Expected')
  await expect(result).toContainText('Hello World')
  await expect(result).toContainText('Actual')
  await expect(result).toContainText('Hello  World')
  await expect(result).toContainText('Error')
  await page.getByTestId('test-show-hint').click()
  await expect(page.getByTestId('test-hint')).toBeVisible()
  await page.getByTestId('test-show-hint').click()
  await expect(page.getByTestId('test-show-hint')).not.toBeVisible()

  await page.getByTestId('stage-code').click()
  await editor.focus()
  await editor.press('Control+A')
  await editor.press('Backspace')
  await editor.type('print("Hello\\nWorld")')
  await page.getByTestId('stage-test').click()
  await page.getByTestId('test-code').click()
  await expect(result).toContainText('FAIL')
  await expect(result).toContainText('Hello\nWorld')

  await page.getByTestId('stage-code').click()
  await editor.focus()
  await editor.press('Control+A')
  await editor.press('Backspace')
  await editor.type('print("Hello World")')
  await page.getByTestId('stage-test').click()
  await page.getByTestId('test-code').click()
  await expect(result).toContainText('PASS')
})

test('Level 1 Run prompts for input and resumes execution', async ({ page }) => {
  await openSession(page)
  await enableExploreMode(page)
  await page.getByTestId('stage-code').click()

  const editor = page.getByRole('textbox', { name: 'Python code editor' })
  await expect(editor).toBeVisible()
  await editor.focus()
  await editor.press('Control+A')
  await editor.press('Backspace')
  await editor.type('name = input("What is your name?")\nprint(name)')

  await page.getByTestId('run-code').click()
  const interactiveInput = page.getByTestId('interactive-input')
  await expect(interactiveInput).toContainText('What is your name?')
  await page.getByTestId('interactive-input-field').fill('Toon')
  await page.getByTestId('interactive-input-submit').click()
  await expect(page.getByTestId('code-result')).toContainText('Toon')
})
