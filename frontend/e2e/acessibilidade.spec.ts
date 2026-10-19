import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Varredura WCAG 2.1 AA (axe-core) nas telas principais, nos temas claro e escuro. */
async function semViolacoes(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const resumo = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + n.html.slice(0, 80) + ' ' + (n.any[0]?.message ?? '')).join(' | ')}`);
  expect(resumo).toEqual([]);
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`Acessibilidade WCAG AA — tema ${tema}`, () => {
    test.use({ colorScheme: tema });

    test('login e página pública', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
      await semViolacoes(page);
      await page.goto('/carga-1');
      await expect(page.getByRole('heading', { name: 'O que você vai fazer?' })).toBeVisible();
      await semViolacoes(page);
      // Estado com serviço, dia e horário escolhidos (botões marcados e barra de resumo)
      await page.getByRole('button', { name: /^Escolher Corte masculino/ }).click();
      const prof = page.locator('.pub-profissional').first();
      if (await prof.count()) await prof.click();
      await page.locator('.pub-dia').nth(2).click();
      await page.locator('.pub-horario:not([disabled])').first().click();
      await expect(page.locator('.pub-horario[aria-pressed="true"]')).toHaveCount(1);
      await semViolacoes(page);
    });

    test('telas do painel', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/usu[aá]rio/i).fill('dono_carga_1');
      await page.getByLabel(/senha/i).fill('Carga-123!');
      await page.getByRole('button', { name: /entrar/i }).click();
      await expect(page).toHaveURL(/\/dashboard/);
      for (const rota of ['', '/servicos', '/profissionais', '/horarios', '/financeiro', '/configuracoes']) {
        await page.goto(`/dashboard${rota}`);
        await expect(page.locator('.skeleton')).toHaveCount(0);
        await semViolacoes(page);
      }
    });
  });
}
