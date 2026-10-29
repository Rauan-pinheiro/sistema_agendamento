import { expect, test } from '@playwright/test';

/** Fluxos de ponta a ponta: cliente agenda e o dono vê; cadastro com aceite (LGPD) e exclusão da conta. */

test('cliente agenda pela página pública e o dono vê no painel', async ({ page }) => {
  const nome = `Cliente E2E ${test.info().project.name} ${Date.now()}`;
  await page.goto('/carga-1');
  await page.getByRole('button', { name: /^Adicionar Corte masculino/ }).click();
  const prof = page.locator('.membro').first();
  if (await prof.count()) await prof.click();
  // Quinto dia da faixa (o último botão é "Outra data"); longe dos dias usados nos outros testes
  await page.getByRole('group', { name: 'Próximos dias' }).getByRole('button').nth(4).click();
  await page.locator('.chip-horario:not([disabled])').last().click();
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByLabel('WhatsApp').fill('85988887777');
  await expect(page.getByRole('link', { name: 'Política de privacidade' })).toBeVisible();
  await page.getByRole('region', { name: 'Resumo do agendamento' }).getByRole('button', { name: 'Agendar' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido de agendamento enviado' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel(/usu[aá]rio/i).fill('dono_carga_1');
  await page.getByLabel(/senha/i).fill('Carga-123!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Agenda' }).first().click();
  await page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Lista' }).click();
  await page.getByRole('button', { name: 'Pendentes' }).click();
  await expect(page.getByText(nome)).toBeVisible();
});

test('cadastro exige aceite dos termos, cria a conta e permite excluí-la', async ({ page }) => {
  const id = `${test.info().project.name}${Date.now()}`.replace(/\W/g, '').slice(-14);
  const senha = 'Senha-Forte-E2E-9';
  await page.goto('/register');
  await page.getByLabel('Usuário').fill(`dona_${id}`);
  await page.getByLabel('E-mail').fill(`dona_${id}@teste.com`);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByLabel('Confirmar senha').fill(senha);
  await page.getByLabel('Nome da empresa').fill(`Salão ${id}`);
  await page.getByLabel('WhatsApp').fill('85999990000');

  // Termos abrem em outra aba e o cadastro não sai sem o aceite
  const [termos] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'Termos de Uso' }).click(),
  ]);
  await expect(termos.getByRole('heading', { name: 'Termos de Uso', level: 1 })).toBeVisible();
  await termos.close();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/register/);

  await page.getByRole('checkbox', { name: /aceito os Termos/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/dashboard/configuracoes'); // rota antiga redireciona para Ajustes
  await expect(page).toHaveURL(/\/dashboard\/ajustes$/);
  await page.getByRole('heading', { name: 'Privacidade e dados' }).scrollIntoViewIfNeeded();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar dados' }).click();
  expect((await download).suggestedFilename()).toMatch(/^dados-.*\.json$/);

  await page.getByLabel('Senha atual').last().fill(senha);
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir conta' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Entrar no painel' })).toBeVisible();

  // A conta não existe mais
  await page.getByLabel(/usu[aá]rio/i).fill(`dona_${id}`);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
