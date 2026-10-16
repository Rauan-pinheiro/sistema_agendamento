import { expect, test } from '@playwright/test';

test.describe('Painel do dono — anexos do agendamento', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/usu[aá]rio/i).fill('dono_carga_1');
    await page.getByLabel(/senha/i).fill('Carga-123!');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('expande um agendamento e mostra a galeria de fotos e vídeos', async ({ page }) => {
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    const card = page.locator('.agendamento-card').first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByText('Fotos e vídeos')).toBeVisible();
    await expect(page.getByRole('button', { name: /adicionar/i })).toBeVisible();
    await expect(page.getByText(/0\/15/)).toBeVisible();
    await page.screenshot({ path: `test-results/painel-anexos-${test.info().project.name}.png`, fullPage: true });
  });

  test('rejeita arquivo com conteúdo diferente da extensão, sem enviar', async ({ page }) => {
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    await page.locator('.agendamento-card').first().click();
    const assinaturas: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/anexos/assinatura/')) assinaturas.push(r.url()); });
    await page.locator('.anexos input[type=file]').first().setInputFiles({
      name: 'falso.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('GIF89a-isto-nao-e-jpeg'),
    });
    await expect(page.getByText(/tipo não permitido/i)).toBeVisible();
    expect(assinaturas).toHaveLength(0);
  });
});
