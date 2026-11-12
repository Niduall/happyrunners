import { expect, test } from '@playwright/test'
import {
  deleteOwnMessages,
  loginAsTestUser,
  openChat,
  sendMessage,
} from './helpers'

test('réagit à un message et voit qui a réagi', async ({ page }) => {
  await loginAsTestUser(page)
  await openChat(page)

  const body = `E2E réaction ${Date.now()}`
  await sendMessage(page, body)

  await page.getByText(body, { exact: true }).click({ button: 'right' })
  await page.getByRole('button', { name: /J.aime/ }).click()

  const pill = page.getByRole('button', {
    name: /J.aime, 1 personne, votre réaction/,
  })
  await expect(pill).toBeVisible()

  // Un appui sur la pastille ouvre la liste des personnes, il ne retire pas
  // la réaction (c'est le rôle de la palette).
  await pill.click()
  const dialog = page.getByRole('dialog', { name: 'Personnes ayant réagi' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Test\s*\(vous\)/)).toBeVisible()
})

test.afterEach(async ({ page }) => {
  await deleteOwnMessages(page).catch(() => {
    // Un échec de connexion ne doit pas masquer l'erreur du scénario.
  })
})
