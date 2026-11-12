import { expect, type Page } from '@playwright/test'

/**
 * Compte dédié aux tests E2E, créé sur la base de **test** au premier passage.
 * Sans PIN : les runs suivants se connectent directement par le nom.
 */
export const TEST_USER = { firstName: 'Test', lastName: 'E2E' }

/**
 * Connexion par nom. Au premier passage, le profil n'existe pas : on passe
 * l'écran de création sans PIN. Les passages suivants arrivent directement
 * sur l'accueil.
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Prénom', { exact: true }).fill(TEST_USER.firstName)
  await page.getByLabel('Nom', { exact: true }).fill(TEST_USER.lastName)
  await page.getByRole('button', { name: 'Continuer' }).click()

  const skipPin = page.getByRole('button', { name: 'Passer sans PIN' })
  const home = page.getByRole('button', { name: 'Je viens' })
  await expect(skipPin.or(home)).toBeVisible()
  if (await skipPin.isVisible()) await skipPin.click()
  await expect(home).toBeVisible()
}

/** Ouvre le chat et attend que la saisie soit prête. */
export async function openChat(page: Page): Promise<void> {
  await page.goto('/messages')
  await expect(page.getByLabel('Ton message')).toBeVisible()
}

/**
 * Envoie un message et attend la fin de l'envoi optimiste. Tant que la ligne
 * n'a pas son identifiant serveur, la palette (réponse, réaction) est
 * volontairement indisponible.
 */
export async function sendMessage(page: Page, body: string): Promise<void> {
  const composer = page.getByLabel('Ton message')
  await composer.fill(body)
  await page.getByRole('button', { name: 'Envoyer le message' }).click()
  // Le composeur ne se vide qu'après l'accusé du serveur : c'est le signal
  // que la ligne a bien un identifiant et que la palette est disponible.
  await expect(composer).toHaveValue('')
  await expect(page.getByText(body, { exact: true })).toBeVisible()
}

/**
 * Supprime les messages du compte de test : ce sont les seuls dont le bouton
 * « Supprimer ce message » est affiché. Laisse la base de test propre entre
 * deux runs, même après un échec.
 */
export async function deleteOwnMessages(page: Page): Promise<void> {
  await openChat(page)
  // Attendre la fin du chargement : sans ça, le compte des boutons vaut 0
  // et le nettoyage ne supprime rien.
  const ready = page
    .locator('.chat-message-text')
    .or(page.getByText('Aucun message pour l’instant.'))
  await expect(ready.first()).toBeVisible()

  const deleteButtons = page.getByRole('button', {
    name: 'Supprimer ce message',
  })
  for (let remaining = await deleteButtons.count(); remaining > 0; remaining -= 1) {
    await deleteButtons.first().click()
    await expect(deleteButtons).toHaveCount(remaining - 1)
  }
}
