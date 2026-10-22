// Jornada completa pelo navegador (celular 360 px e desktop) contra a simulação de produção
// ou o ambiente de desenvolvimento, com screenshots e coleta de problemas:
// violações de CSP, erros de console, requisições que falharam, HTTP >= 400 e rolagem horizontal.
//
// Uso (na raiz do repositório):
//   node simulacao/verificar_navegador.mjs [saida] [url-do-front]
//   padrão: simulacao/resultados/navegador  https://localhost:9443
// Sai com código 1 se encontrar qualquer problema.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(fileURLToPath(new URL('../frontend/package.json', import.meta.url)));
const { chromium } = require('@playwright/test');

const OUT = process.argv[2] ?? 'simulacao/resultados/navegador';
const BASE = process.argv[3] ?? 'https://localhost:9443';
mkdirSync(OUT, { recursive: true });
const achados = [];

const VIEWPORTS = {
  celular: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1366, height: 820 } },
};

async function rodar(nome, opts) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...opts, acceptDownloads: true, locale: 'pt-BR', timezoneId: 'America/Fortaleza',
    ignoreHTTPSErrors: true, // certificado local da simulação
  });
  // Toda violação de CSP vira erro de console (e entra nos achados)
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP bloqueou ${e.blockedURI || 'inline'} (${e.violatedDirective})`));
  });
  const page = await ctx.newPage();
  const passo = { atual: 'inicio' };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') achados.push(`[${nome}] ${passo.atual} console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => achados.push(`[${nome}] ${passo.atual} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => achados.push(`[${nome}] ${passo.atual} requisição falhou: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) achados.push(`[${nome}] ${passo.atual} HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
  let n = 0;
  async function foto(rotulo, full = true) {
    passo.atual = rotulo;
    const larg = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (larg[0] > larg[1] + 1) achados.push(`[${nome}] ${rotulo}: rolagem horizontal (${larg[0]} > ${larg[1]})`);
    await page.screenshot({ path: `${OUT}/${nome}-${String(++n).padStart(2, '0')}-${rotulo}.png`, fullPage: full });
  }

  const id = `${nome}${Date.now()}`.slice(-12);
  const senha = 'Senha-Forte-Manual-9';
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 300 } });
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]), Buffer.alloc(2000)]);

  // 1. Cadastro
  passo.atual = 'cadastro';
  await page.goto(`${BASE}/register`);
  await page.getByLabel('Usuário').fill(`dono_${id}`);
  await page.getByLabel('E-mail').fill(`dono_${id}@teste.com`);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByLabel('Confirmar senha').fill(senha);
  await page.getByLabel('Nome da empresa').fill(`Studio ${id}`);
  await page.getByLabel('WhatsApp').fill('85999990000');
  await page.getByRole('checkbox', { name: /aceito os Termos/ }).check();
  await foto('cadastro');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForURL(/\/dashboard/);
  await page.waitForTimeout(800);
  await foto('painel-vazio');
  const slug = (await page.evaluate(() => JSON.parse(localStorage.getItem('empresa') || 'null')?.slug)) ?? `studio-${id}`;

  // 2. Serviço com foto, vídeo e YouTube
  await page.goto(`${BASE}/dashboard/servicos`);
  await page.waitForTimeout(600);
  await foto('servicos-vazio');
  await page.getByRole('button', { name: /Novo serviço|Adicionar serviço/ }).first().click();
  await page.getByLabel('Nome').fill('Corte com lavagem');
  await page.getByLabel(/Descrição/).fill('Corte personalizado com lavagem, toalha quente e finalização com pomada. Inclui conversa para entender o estilo.');
  await page.getByLabel('Duração (minutos)').fill('45');
  await page.getByLabel('Preço (R$)').fill('55');
  await foto('servico-novo', false);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Editar' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('input[type=file][multiple]').first().setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await dlg.getByRole('button', { name: /^Abrir / }).first().waitFor({ timeout: 15000 }).catch(() => achados.push(`[${nome}] foto da vitrine não apareceu`));
  await dlg.locator('input[type=file][multiple]').first().setInputFiles({ name: 'video.mp4', mimeType: 'video/mp4', buffer: mp4 });
  await page.waitForTimeout(2500);
  await dlg.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await dlg.getByRole('button', { name: 'Adicionar link' }).click();
  await page.waitForTimeout(1500);
  await foto('servico-vitrine', false);
  await page.keyboard.press('Escape');

  // 3. Grade: todos os dias, 08:00–18:00
  await page.goto(`${BASE}/dashboard/horarios`);
  await page.waitForTimeout(600);
  await foto('horarios-vazio');
  for (let i = 0; i < 7; i++) {
    const btn = page.getByRole('button', { name: /Adicionar dia/ }).first();
    if (!(await btn.isVisible().catch(() => false)) || await btn.isDisabled()) break;
    await btn.click();
    await page.getByLabel('Início').fill('08:00');
    await page.getByLabel('Fim').fill('18:00');
    await page.getByRole('dialog').getByRole('button', { name: /Salvar/ }).click();
    await page.waitForTimeout(500);
  }
  await foto('horarios-preenchidos');

  // 4. Reserva pela página pública
  await page.goto(`${BASE}/${slug}`);
  await page.waitForTimeout(800);
  await foto('publica');
  await page.getByRole('button', { name: /ver mais/i }).first().click();
  await page.waitForTimeout(1200);
  await foto('publica-ver-mais', false);
  await page.getByRole('dialog').getByRole('button', { name: /adicionar|escolher/i }).first().click();
  await page.locator('.pub-dia').nth(1).click();
  await page.waitForTimeout(800);
  await foto('publica-horarios');
  await page.locator('.pub-horario:not([disabled])').nth(2).click();
  await page.getByLabel('Seu nome').fill('Maria Cliente');
  await page.getByLabel('WhatsApp').fill('85988887777');
  await page.waitForTimeout(500);
  await foto('publica-dados', false);
  await page.getByRole('region', { name: 'Resumo do agendamento' }).getByRole('button', { name: 'Agendar' }).click();
  await page.getByRole('heading', { name: 'Pedido de agendamento enviado' }).waitFor();
  await foto('publica-sucesso');

  // 5. Painel: confirmar e anexar
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Todos', exact: true }).click().catch(() => {});
  await page.waitForTimeout(800);
  await foto('painel-agendamentos');
  await page.locator('.agendamento-card').first().click();
  await page.waitForTimeout(600);
  await page.locator('.anexos input[type=file][multiple]').first().setInputFiles({ name: 'antes.png', mimeType: 'image/png', buffer: png });
  await page.locator('.anexos').getByRole('button', { name: /^Abrir / }).first().waitFor({ timeout: 15000 }).catch(() => achados.push(`[${nome}] anexo não apareceu`));
  await foto('painel-anexo');
  await page.locator('.anexos').getByRole('button', { name: /^Abrir / }).first().click();
  await page.waitForTimeout(800);
  await foto('painel-lightbox', false);
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/dashboard/financeiro`);
  await page.waitForTimeout(1200);
  await foto('financeiro');
  await page.goto(`${BASE}/dashboard/profissionais`);
  await page.waitForTimeout(800);
  await foto('profissionais');

  // 6. Exportar e excluir conta
  await page.goto(`${BASE}/dashboard/configuracoes`);
  await page.waitForTimeout(800);
  await foto('configuracoes');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar dados' }).click();
  const arq = await dl;
  writeFileSync(`${OUT}/${nome}-export.json`, '');
  await arq.saveAs(`${OUT}/${nome}-export.json`);
  await page.getByLabel('Senha atual').last().fill(senha);
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await foto('excluir-confirmacao', false);
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir conta' }).click();
  await page.waitForURL(/\/login/);
  await foto('login-apos-excluir');

  await page.goto(`${BASE}/termos`);
  await foto('termos');
  await page.goto(`${BASE}/privacidade`);
  await foto('privacidade');
  await browser.close();
}

for (const [nome, opts] of Object.entries(VIEWPORTS)) {
  try { await rodar(nome, opts); } catch (e) { achados.push(`[${nome}] FALHOU: ${e.message.split('\n')[0]}`); }
}
writeFileSync(`${OUT}/achados.txt`, achados.join('\n'));
console.log(achados.length ? achados.join('\n')
  : 'Navegador: OK (0 violações de CSP, 0 erros de console, 0 falhas de rede, 0 HTTP >= 400, 0 rolagem horizontal)');
process.exit(achados.length ? 1 : 0);
