import { expect, test } from '@playwright/test';

const YT = 'dQw4w9WgXcQ';

test.describe('Ver mais do serviço', () => {
  test('dono cadastra YouTube na vitrine e cliente vê, reproduz e adiciona pelo modal', async ({ page }) => {
    // Não depende de rede externa: miniaturas e player do YouTube são bloqueados
    await page.route(/ytimg\.com|youtube-nocookie\.com/, (r) => r.abort());

    // ── Dono: adiciona link do YouTube ao primeiro serviço ──────────────────
    await page.goto('/login');
    await page.getByLabel(/usu[aá]rio/i).fill('dono_carga_1');
    await page.getByLabel(/senha/i).fill('Carga-123!');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/dashboard/servicos');
    await page.getByTitle('Editar').first().click();
    const dialogo = page.getByRole('dialog');
    const nomeServico = await dialogo.getByLabel('Nome').inputValue();

    await dialogo.getByLabel('Link do YouTube').fill('https://vimeo.com/123');
    await dialogo.getByRole('button', { name: 'Adicionar link' }).click();
    await expect(dialogo.getByText(/link inválido/i)).toBeVisible();

    await dialogo.getByLabel('Link do YouTube').fill(`youtu.be/${YT}`);
    await dialogo.getByRole('button', { name: 'Adicionar link' }).click();
    await expect(dialogo.getByRole('button', { name: /abrir vídeo do youtube/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // ── Cliente: página pública ─────────────────────────────────────────────
    await page.goto('/carga-1');
    const nomeExato = new RegExp(`^${nomeServico.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const card = page.locator('.service-card').filter({ has: page.locator('.service-name', { hasText: nomeExato }) });
    await card.getByRole('button', { name: /ver mais/i }).click();

    const modal = page.getByRole('dialog', { name: nomeServico });
    await expect(modal).toBeVisible();
    await expect(card).not.toHaveClass(/selected/); // "Ver mais" não marca o serviço
    await expect(modal.locator('iframe')).toHaveCount(0); // player ainda não carregou

    await page.screenshot({ path: `test-results/ver-mais-modal-${test.info().project.name}.png` });
    await modal.getByRole('button', { name: /reproduzir vídeo/i }).click();
    await expect(modal.locator('iframe')).toHaveAttribute('src', new RegExp(`youtube-nocookie\.com/embed/${YT}`));

    await modal.getByRole('button', { name: /adicionar/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card).toHaveClass(/selected/);
    await expect(page.getByText('1 serviço')).toBeVisible();
    await page.screenshot({ path: `test-results/ver-mais-${test.info().project.name}.png` });
  });
});
