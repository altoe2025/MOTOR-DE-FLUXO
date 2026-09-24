import { expect, test } from '@playwright/test';

import { auditAccessibility } from './helpers/accessibilityAudit';

test('login has semantic structure and accessible controls', async ({ page }) => {
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await auditAccessibility(page);
});

test('import has semantic structure and accessible controls', async ({ page }) => {
  await page.goto('/importar');
  await expect(page.getByRole('heading', { name: /Importar/ })).toBeVisible();
  await auditAccessibility(page);
});

test('demo, chat and presentation preserve keyboard focus and readable structure', async ({ page }, testInfo) => {
  await page.goto('/estudos');
  await expect(page.getByRole('heading', { name: 'Estudos' })).toBeVisible();
  await auditAccessibility(page);
  const opener = page.getByRole('button', { name: 'Perguntar', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const chat = page.getByRole('dialog', { name: 'Chat' });
  await expect(chat).toBeVisible();
  await expect(chat.getByRole('heading', { name: 'Chat' })).toBeFocused();
  await auditAccessibility(page);
  await expect(chat.locator('[aria-live="polite"][aria-atomic="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(chat).toBeHidden();
  await expect(opener).toBeFocused();

  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect.poll(async () => (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies.length).toBe(1);
  const study = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies[0]!;
  const scenario = study.scenarios[0]!;
  const diagnostic = study.diagnostics.find((item) => item.scenarioId === scenario.id)!;
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${diagnostic.id}`);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
  await auditAccessibility(page);
  await page.emulateMedia({ media: 'print' });
  await auditAccessibility(page, { print: true });
  await expect(page.getByRole('button', { name: 'Perguntar', exact: true })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('region', { name: 'Resumo executivo' })).toBeVisible();
  for (const zoom of [2, 4]) {
    await page.setViewportSize({ width: 1280 / zoom, height: 720 / zoom });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 10).map((element) => `${element.tagName}.${(element as HTMLElement).className}: ${element.getBoundingClientRect().right}`));
    expect(overflow).toEqual([]);
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`presentation-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
});
