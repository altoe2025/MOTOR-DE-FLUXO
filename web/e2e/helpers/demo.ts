import { type Page } from '@playwright/test';

/**
 * Conta nova começa vazia: a demonstração só entra pelo botão explícito.
 * Carrega o estudo demonstrativo quando a conta ainda não tem nenhum e volta a /estudos.
 */
export async function loadDemoIfEmpty(page: Page): Promise<void> {
  if (!new URL(page.url()).pathname.endsWith('/estudos')) await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  const { studies } = await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot());
  if (studies.length > 0) return;
  await page.getByRole('button', { name: 'Carregar estudo demonstrativo' }).click();
  await page.waitForURL(/\/carteira\/[0-9a-f-]+$/);
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
}
