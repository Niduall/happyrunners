import { expect, test } from '@playwright/test'
import { loginAsTestUser } from './helpers'

test('connexion, présence et vote pour un parcours', async ({ page }) => {
  await loginAsTestUser(page)

  const going = page.getByRole('button', { name: 'Je viens' })
  await going.click()
  await expect(going).toHaveAttribute('aria-pressed', 'true')

  // Repart d'un état propre si un run précédent a laissé un vote.
  const myChoice = page.getByRole('button', { name: 'Mon choix' })
  if ((await myChoice.count()) > 0) {
    await myChoice.first().click()
    await expect(myChoice).toHaveCount(0)
  }

  const vote = page.getByRole('button', { name: 'Je veux celui-ci' }).first()
  await expect(vote).toBeVisible()
  await vote.click()

  const chosen = page.getByRole('button', { name: 'Mon choix' })
  await expect(chosen).toHaveCount(1)
  await expect(chosen).toHaveAttribute('aria-pressed', 'true')
})

test.afterEach(async ({ page }) => {
  // « Pas cette semaine » retire aussi le vote (trigger en base) : le compte
  // de test ne laisse aucune présence « going » derrière lui.
  const skip = page.getByRole('button', { name: 'Pas cette semaine' })
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await expect(skip).toHaveAttribute('aria-pressed', 'true')
  }
})
