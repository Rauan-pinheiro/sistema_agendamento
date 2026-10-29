/*
 * Gera os screenshots dos protótipos e roda o axe (WCAG 2.1 AA) em cada tela.
 * Uso (na raiz do repositório, depois de `cd frontend && npm ci`):
 *   node docs/design/capturar.cjs            → todas as direções
 *   node docs/design/capturar.cjs a c        → só as direções A e C
 */
const path = require('path');
const fs = require('fs');
const front = path.resolve(__dirname, '../../frontend/node_modules');
const { chromium } = require(path.join(front, 'playwright'));
const { default: AxeBuilder } = require(path.join(front, '@axe-core/playwright'));

const DIRECOES = process.argv.slice(2).length ? process.argv.slice(2) : ['a', 'b', 'c'];
const TELAS = ['publica', 'hoje', 'agenda', 'financeiro'];
const TAMANHOS = { celular: { width: 360, height: 780 }, desktop: { width: 1440, height: 900 } };
const TEMAS = { claro: 'light', escuro: 'dark' };
const SAIDA = path.join(__dirname, 'screenshots');

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const navegador = await chromium.launch();
  const relatorio = {};
  for (const d of DIRECOES) {
    for (const [tam, viewport] of Object.entries(TAMANHOS)) {
      for (const [tema, colorScheme] of Object.entries(TEMAS)) {
        const ctx = await navegador.newContext({ viewport, colorScheme, reducedMotion: 'reduce' });
        const pagina = await ctx.newPage();
        for (const tela of TELAS) {
          const url = 'file:///' + path.join(__dirname, `direcao-${d}`, `${tela}.html`).replace(/\\/g, '/');
          await pagina.goto(url);
          await pagina.evaluate(() => document.fonts.ready);
          const nome = `${d}-${tela}-${tam}-${tema}`;
          // Viewport na altura da página: barras fixas (carrinho, abas) saem no rodapé, como no aparelho
          const altura = await pagina.evaluate(() => document.documentElement.scrollHeight);
          await pagina.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, altura) });
          await pagina.screenshot({ path: path.join(SAIDA, `${nome}.png`) });
          await pagina.setViewportSize(viewport);
          const r = await new AxeBuilder({ page: pagina }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          relatorio[nome] = r.violations.map((v) => ({ regra: v.id, impacto: v.impact, alvos: v.nodes.map((n) => n.target.join(' ')).slice(0, 5) }));
          console.log(`${nome}: ${r.violations.length ? r.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ') : 'axe ok'}`);
        }
        await ctx.close();
      }
    }
  }
  await navegador.close();
  const arquivo = path.join(SAIDA, 'axe.json');
  const anterior = fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : {};
  fs.writeFileSync(arquivo, JSON.stringify({ ...anterior, ...relatorio }, null, 2));
})();
