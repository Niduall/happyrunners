import { expect, test } from '@playwright/test'
import {
  deleteOwnMessages,
  loginAsTestUser,
  openChat,
  sendMessage,
} from './helpers'

test('envoie un message et y répond avec une citation', async ({ page }) => {
  await loginAsTestUser(page)
  await openChat(page)

  const original = `E2E original ${Date.now()}`
  await sendMessage(page, original)

  // Clic droit = palette « Actions du message », comme l'appui long.
  await page.getByText(original, { exact: true }).click({ button: 'right' })
  await page.getByRole('button', { name: 'Répondre' }).click()

  await expect(page.getByText(/Réponse à Test/)).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: original })
  ).toBeVisible()

  const reply = `E2E réponse ${Date.now()}`
  await sendMessage(page, reply)

  // La bulle de la réponse porte l'instantané du message cité.
  const replyBubble = page
    .locator('.chat-message-text')
    .filter({ hasText: reply })
  await expect(replyBubble.getByText(original, { exact: true })).toBeVisible()
})

test.afterEach(async ({ page }) => {
  await deleteOwnMessages(page).catch(() => {
    // Un échec de connexion ne doit pas masquer l'erreur du scénario.
  })
})
