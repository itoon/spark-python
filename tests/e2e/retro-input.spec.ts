import { expect, test, type Page } from '@playwright/test'

const brandProgram = `name = input("What is your name?")
pet = input("What is your pet name?")
print("Your brand name is "+name+" "+pet)
`

async function startRetro(page: Page) {
  await page.addInitScript((code) => {
    localStorage.setItem('cv-python-lab-files', JSON.stringify({ 'main.py': code }))
    localStorage.setItem('cv-python-lab-retro-mode', 'true')
  }, brandProgram)
  await page.goto('/')
  await expect(page.locator('.editor-meta')).toHaveText('Runtime: ready', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const crt = page.getByLabel('Retro Spark Coding Lab Python terminal')
  await expect(crt).toBeVisible()
  await crt.getByRole('button', { name: 'RUN' }).click()
  await expect(crt.locator('.prompt-mark')).toBeVisible({ timeout: 30_000 })
}

test('retro input types each prompt from scratch instead of leftover characters', async ({ page }) => {
  test.setTimeout(120_000)
  await startRetro(page)
  const crt = page.getByLabel('Retro Spark Coding Lab Python terminal')
  const answer = crt.locator('.answer')
  await expect(crt.locator('.terminal')).toContainText('What is your name?')
  await answer.click()
  await page.keyboard.type('TEST')
  await page.keyboard.press('Enter')
  await expect(crt.locator('.prompt-mark')).toBeVisible({ timeout: 30_000 })
  const screen = await crt.locator('.terminal').innerText()
  expect(screen).not.toContain('What is your name?ame?')
  expect(screen).toContain('What is your name?TEST')
  expect(screen).toContain('What is your pet name?')
  await answer.click()
  await page.keyboard.type('Buddy')
  await page.keyboard.press('Enter')
  await expect(crt.locator('.terminal')).toContainText('Your brand name is TEST Buddy', { timeout: 30_000 })
})
