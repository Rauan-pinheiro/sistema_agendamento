/*
 * Screenshots da interface final (fase 11), em WebP, no modo demonstração.
 *
 *   1. API:   cd backend && MIDIA_PROVEDOR=local DATABASE_URL=sqlite:///demo.sqlite3 python manage.py popular_demo
 *             MIDIA_PROVEDOR=local DATABASE_URL=sqlite:///demo.sqlite3 MIDIA_LOCAL_URL_BASE=http://localhost:4173 python manage.py runserver
 *   2. Front: cd frontend && npm run build && npx vite preview --port 4173
 *   3. node docs/screenshots/capturar.cjs        (BASE=http://outro:porta para mudar o endereço)
 *
 * Usa o Playwright já instalado em frontend/. Converte cada PNG em WebP (qualidade 0,8) no próprio
 * Chromium, para manter a pasta abaixo de 3 MB.
 */
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('../../frontend/node_modules/playwright');

const BASE = process.env.BASE || 'http://localhost:4173';
const SAIDA = __dirname;
const CELULAR = { ...devices['Pixel 7'], deviceScaleFactor: 1.5 };
const DESKTOP = { viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 };

async function paraWebp(conversor, png, arquivo) {
  const b64 = await conversor.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, 'data:image/png;base64,' + png.toString('base64'));
  fs.writeFileSync(path.join(SAIDA, arquivo), Buffer.from(b64, 'base64'));
}

/** Escolhe serviço, profissional, dia e horário (mostra carrinho e "Seus dados"). */
async function montarReserva(p) {
  await p.getByRole('button', { name: /^Adicionar / }).nth(1).click();
  const membro = p.locator('.membro').nth(1);
  if (await membro.count()) await membro.click();
  await p.getByRole('group', { name: 'Próximos dias' }).getByRole('button').nth(1).click();
  await p.locator('.chip-horario:not([disabled])').nth(2).click();
  await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 0));
}

async function entrar(p, usuario) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel(/usu[aá]rio/i).fill(usuario);
  await p.getByLabel(/senha/i).fill('Demo-123!');
  await p.getByRole('button', { name: /entrar/i }).click();
  await p.waitForURL(/dashboard/);
}

(async () => {
  const navegador = await chromium.launch();
  const conversor = await navegador.newPage();
  const capturas = [];

  for (const [disp, opts] of [['celular', CELULAR], ['desktop', DESKTOP]]) {
    for (const tema of ['claro', 'escuro']) {
      const ctx = await navegador.newContext({ ...opts, colorScheme: tema === 'claro' ? 'light' : 'dark' });
      const p = await ctx.newPage();
      const foto = async (nome, cheia = true) => {
        const arq = `${nome}-${disp}-${tema}.webp`;
        await paraWebp(conversor, await p.screenshot({ fullPage: cheia }), arq);
        capturas.push(arq);
      };

      // Página pública: com todas as fotos e sem nenhuma
      await p.goto(`${BASE}/demo-studio-lume`);
      await p.getByRole('heading', { name: 'Serviços' }).waitFor();
      await p.waitForTimeout(600);
      await foto('publica-com-fotos-inicio', false);
      await montarReserva(p);
      await foto('publica-com-fotos-reserva');
      if (tema === 'claro') {
        await p.goto(`${BASE}/demo-canto-do-corte`);
        await p.getByRole('heading', { name: 'Serviços' }).waitFor();
        await montarReserva(p);
        await foto('publica-sem-fotos-reserva');
      }

      // Painel
      await entrar(p, 'demo_lume');
      for (const [rota, nome, cheia] of [
        ['', 'painel-hoje', disp === 'celular'], ['/agenda', 'painel-agenda-dia', false],
        ['/agenda?visao=semana', 'painel-agenda-semana', false], ['/servicos', 'painel-servicos', false],
        ['/financeiro', 'painel-financeiro', false], ['/ajustes', 'painel-ajustes', false],
      ]) {
        if (tema === 'escuro' && !['painel-hoje', 'painel-agenda-dia'].includes(nome)) continue;
        await p.goto(`${BASE}/dashboard${rota}`);
        await p.waitForTimeout(1200);
        await foto(nome, cheia);
      }
      if (tema === 'claro') {
        await p.goto(`${BASE}/dashboard/agenda`);
        await p.locator('.ev').first().click();
        await p.getByRole('dialog').waitFor();
        await p.waitForTimeout(500);
        await foto('painel-detalhe-horario', false);
      }
      await ctx.close();
    }
  }
  await navegador.close();
  const total = capturas.reduce((t, a) => t + fs.statSync(path.join(SAIDA, a)).size, 0);
  console.log(`${capturas.length} screenshots, ${(total / 1024 / 1024).toFixed(2)} MB`);
})();
