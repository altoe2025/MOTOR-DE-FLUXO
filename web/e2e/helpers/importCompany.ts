import type { Page } from '@playwright/test';

/** Prepara uma empresa nova na importação; com empresas já cadastradas, o campo abre em "+ Nova empresa". */
export async function fillNewCompany(page: Page, name: string) {
  const field = page.getByLabel('Nome da nova empresa');
  const addCompany = page.getByRole('button', { name: '+ Nova empresa' });
  await field.or(addCompany).first().waitFor();
  if (await addCompany.isVisible()) await addCompany.click();
  await field.fill(name);
}
