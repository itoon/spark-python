import { expect, test, type Page } from '@playwright/test'

async function startDebug(page: Page, source: string) {
  await page.addInitScript((code) => {
    localStorage.setItem('cv-python-lab-files', JSON.stringify({ 'main.py': code }))
  }, source)
  await page.goto('/')
  await expect(page.locator('.editor-meta')).toHaveText('Runtime: ready', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Debug file', exact: true }).click()
  await expect(page.locator('.editor-meta')).toContainText('Paused', { timeout: 120_000 })
}

test('Next step evaluates names separately and prints only after print executes', async ({ page }) => {
  test.setTimeout(120_000)
  await startDebug(page, 'x = 20\ny = 30\nz = x + y\nprint(z)\n')
  const bubble = page.getByTestId('debug-step-bubble')
  const next = page.getByRole('button', { name: /Next step/ })
  const expected = ['x = 20', 'x = 20', 'y = 30', 'y = 30', 'z = x + y', 'z = 20 + y', 'z = 20 + 30', 'z = 50', 'z = 50', 'print(z)', 'print(50)']
  for (const [index, expression] of expected.entries()) {
    await expect(page.locator('.step-label')).toContainText(`Step ${index + 1} /`)
    await expect(bubble).toHaveText(expression)
    await expect(page.locator('.console-output')).not.toContainText('50')
    await next.click()
  }
  await expect(page.locator('.console-output')).toContainText('50')
  const continueBtn = page.getByRole('button', { name: /Continue/ })
  if (await continueBtn.isEnabled()) await continueBtn.click()
  await expect(page.locator('.step-label')).toContainText('Program finished')
  await expect(page.getByTestId('debug-step-bubble')).toBeHidden()
})

test('debug pauses before reaching an infinite loop', async ({ page }) => {
  test.setTimeout(120_000)
  await startDebug(page, 'x = 20\nwhile True:\n    pass\n')
  await expect(page.getByTestId('debug-step-bubble')).toHaveText('x = 20')
  await expect(page.locator('.step-label')).toContainText('Step 1 / 1')
  // A precomputed trace cannot pause here: it would have already reached the loop.
  await expect(page.locator('.console-output')).not.toContainText('10,000')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.step-label')).toContainText('No debug session')
})

test('loop value is anchored to the target variable, not the for keyword', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await startDebug(page, 'for _ in range(5):\n    print(_)\n')
  const bubble = page.getByTestId('debug-step-bubble')
  await expect(bubble).toHaveText('range(5)')
  await page.getByRole('button', { name: /Next step/ }).click()
  await expect(bubble).toHaveText('range(0, 5)')
  await page.getByRole('button', { name: /Next step/ }).click()
  await expect(bubble).toHaveText('0')
  const target = page.locator('.debug-assignment-expression')
  await expect(target).toHaveText('_')
  const targetBox = await target.boundingBox()
  const valueBox = await bubble.locator('code').boundingBox()
  expect(targetBox).not.toBeNull()
  expect(valueBox).not.toBeNull()
  expect(Math.abs(valueBox!.x - targetBox!.x)).toBeLessThan(3)
  expect(Math.abs(valueBox!.y - targetBox!.y)).toBeLessThan(8)
  await page.screenshot({ path: testInfo.outputPath('loop-value-anchor.png') })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
})

test('live input resumes the same execution', async ({ page }) => {
  test.setTimeout(120_000)
  await startDebug(page, 'print("before input")\nname = input("Name? ")\nprint("hello", name)\n')
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.locator('.console-input-field')).toBeVisible()
  await expect(page.locator('.console-output')).toContainText('before input')
  await page.locator('.console-input-field').fill('Ada')
  await page.locator('.console-input-field').press('Enter')
  await expect(page.locator('.console-output')).not.toContainText('Traceback')
  await expect(page.locator('.editor-meta')).toContainText('Paused')
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.locator('.step-label')).toContainText('Program finished')
  await expect(page.locator('.console-output')).toContainText('hello Ada')
  await expect(page.getByTestId('debug-step-bubble')).not.toContainText('<module>')
  expect((await page.locator('.console-output').innerText()).match(/before input/g)).toHaveLength(1)
})
