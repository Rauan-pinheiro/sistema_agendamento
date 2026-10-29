/*
 * Utilitários compartilhados pelos protótipos das três direções:
 * tema claro/escuro, contraste da cor de cada empresa, ícones, menu do painel,
 * agenda por profissional e gráfico de barras. Cada direção só muda o CSS e o HTML.
 */
(function () {
  const D = document.documentElement;
  const E = window.DADOS[D.dataset.empresa];
  const RAIZ = '../comum/';

  const foto = (n) => `${RAIZ}fotos/${n}.webp`;
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v % 1 ? 2 : 0 });
  const dur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
  const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const hora = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  /* Ícones no traço do Lucide (ISC), o mesmo pacote que o app já usa. */
  const PATHS = {
    casa: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    tesoura: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
    pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    carteira: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    mais: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    mais1: '<path d="M12 5v14M5 12h14"/>',
    esq: '<path d="m15 18-6-6 6-6"/>',
    dir: '<path d="m9 18 6-6-6-6"/>',
    mensagem: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    estrela: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    sobe: '<path d="M7 17 17 7M7 7h10v10"/>',
    busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    sacola: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>'
  };
  const icone = (n, cls = 'ic') =>
    `<svg class="${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n]}</svg>`;

  /* ── Contraste (WCAG 2.1) ─────────────────────────────────────────── */
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
  /** Clareia (fundo escuro) ou escurece (fundo claro) a cor até alcançar o contraste pedido. */
  const ajustar = (cor, fundo, alvo) => {
    const rumo = lum(fundo) < 0.2 ? '#ffffff' : '#000000';
    for (let i = 0; i < 24 && contraste(cor, fundo) < alvo; i++) cor = mix(cor, rumo, 0.08);
    return cor;
  };
  const textoSobre = (cor) => (contraste(cor, '#ffffff') >= contraste(cor, '#121417') ? '#ffffff' : '#121417');

  /* A cor da empresa vira 4 variáveis seguras para o tema atual. */
  function aplicarDestaque() {
    if (!E) return;
    D.style.removeProperty('--destaque');
    const cs = getComputedStyle(D);
    const bg = cs.getPropertyValue('--bg').trim();
    const sup = cs.getPropertyValue('--surface').trim();
    const base = D.dataset.destaque || E.destaque;
    const fill = ajustar(base, sup, 3);            // botões e seleção: 3:1 contra a superfície
    D.style.setProperty('--destaque', fill);
    D.style.setProperty('--sobre-destaque', textoSobre(fill));
    const suave = mix(fill, sup, 0.86);
    // Texto na cor da empresa (links, preços, "agora"): 4,5:1 sobre o fundo E sobre o tom suave
    D.style.setProperty('--destaque-texto', ajustar(ajustar(base, bg, 4.5), suave, 4.5));
    D.style.setProperty('--destaque-suave', suave);
  }

  /* ── Tema: segue o sistema; o botão força claro/escuro ────────────── */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const escuro = () => (D.dataset.theme ? D.dataset.theme === 'dark' : mq.matches);
  function pintarBotoesTema() {
    document.querySelectorAll('[data-tema]').forEach((b) => {
      b.innerHTML = icone(escuro() ? 'sol' : 'lua');
      b.setAttribute('aria-label', escuro() ? 'Usar tema claro' : 'Usar tema escuro');
    });
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tema]');
    if (!b) return;
    D.dataset.theme = escuro() ? 'light' : 'dark';
    aplicarDestaque(); pintarBotoesTema();
  });
  mq.addEventListener('change', () => { aplicarDestaque(); pintarBotoesTema(); });

  /* ── Menu do painel ───────────────────────────────────────────────── */
  const MENU = [
    ['hoje', 'Hoje', 'casa', 'hoje.html'],
    ['agenda', 'Agenda', 'calendario', 'agenda.html'],
    ['servicos', 'Serviços', 'tesoura', '#'],
    ['equipe', 'Equipe', 'pessoas', '#'],
    ['financeiro', 'Financeiro', 'carteira', 'financeiro.html'],
    ['ajustes', 'Ajustes', 'ajustes', '#']
  ];
  const ABAS = ['hoje', 'agenda', 'financeiro'];
  function montarPainel() {
    const atual = document.body.dataset.painel;
    const item = ([id, rot, ic, href]) =>
      `<a href="${href}" class="nav-item"${id === atual ? ' aria-current="page"' : ''}>${icone(ic)}<span>${rot}</span></a>`;
    const lat = document.querySelector('[data-lateral]');
    if (lat) lat.innerHTML = MENU.map(item).join('');
    const abas = document.querySelector('[data-abas]');
    if (abas) abas.innerHTML = MENU.filter((m) => ABAS.includes(m[0])).map(item).join('') + item(['mais', 'Mais', 'mais', '#']);
  }

  /* ── Agenda: uma coluna por profissional (dia) ou por dia (semana) ── */
  const STATUS = { concluido: 'Concluído', confirmado: 'Confirmado', pendente: 'Aguardando confirmação', cancelado: 'Cancelado' };
  const AGORA = '13:40';

  function evento([ini, d, cliente, servico, status], ini0, px, extra = '', faixa = '') {
    const top = ((minutos(ini) - ini0 * 60) / 60) * px;
    const fim = hora(minutos(ini) + d);
    const curto = d < 35 ? ' ev--curto' : d < 55 ? ' ev--medio' : '';
    return `<button type="button" class="ev ev--${status}${curto}${extra}" style="top:${top}px;height:${(d / 60) * px - 2}px;${faixa}" aria-label="${ini} a ${fim}, ${cliente}, ${servico}, ${STATUS[status]}">
      <span class="ev-cliente">${cliente}</span><span class="ev-hora">${ini}–${fim}</span><span class="ev-servico">${servico}</span><span class="ev-status">${STATUS[status]}</span></button>`;
  }

  function agenda(el, { ini = 8, fim = 20, px = 64, visao = 'dia' } = {}) {
    const horas = [];
    for (let h = ini + 1; h < fim; h++) horas.push(`<span style="top:${(h - ini) * px}px">${String(h).padStart(2, '0')}:00</span>`);
    let cab, cols;
    if (visao === 'dia') {
      cab = E.profissionais.map((p, i) => {
        const n = E.agenda[i].filter((e) => e[4] !== 'cancelado').length;
        return `<div class="cal-pro"><img src="${foto(p.foto)}" alt="" width="32" height="32"><span><b>${p.nome.split(' ')[0]}</b><small>${n} horários</small></span></div>`;
      });
      cols = E.agenda.map((evs) => `<div class="cal-col">${evs.map((e) => evento(e, ini, px)).join('')}</div>`);
    } else {
      const dias = ['Seg 26', 'Ter 27', 'Qua 28', 'Qui 29', 'Sex 30', 'Sáb 31'];
      cab = dias.map((d, i) => `<div class="cal-pro cal-dia${i === 3 ? ' cal-dia--hoje' : ''}"><span><b>${d}</b></span></div>`);
      cols = dias.map((_, di) => {
        const evs = [];
        E.agenda.forEach((lista, pi) => lista.forEach((e, ei) => {
          if (!(di === 3 || (ei + di + pi) % 3)) return;
          // Semana: cada dia dividido em faixas, uma por profissional
          const larg = 100 / E.profissionais.length;
          const faixa = `left:calc(${pi * larg}% + 2px);right:auto;width:calc(${larg}% - 4px)`;
          evs.push(evento(di < 3 && e[4] !== 'cancelado' ? [...e.slice(0, 4), 'concluido'] : e, ini, px, ` ev--p${pi}`, faixa));
        }));
        return `<div class="cal-col">${evs.join('')}</div>`;
      });
    }
    const agoraTop = ((minutos(AGORA) - ini * 60) / 60) * px;
    const agora = `<div class="cal-agora" style="top:${agoraTop}px"><span>${AGORA}</span></div>`;
    el.innerHTML = `<div class="cal" style="--cols:${cab.length};--px-hora:${px}px">
      <div class="cal-cab"><div class="cal-canto"></div>${cab.join('')}</div>
      <div class="cal-corpo" style="height:${(fim - ini) * px}px"><div class="cal-horas" aria-hidden="true">${horas.join('')}</div>${cols.join('')}${agora}</div></div>`;
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-visao]');
    if (!b) return;
    document.querySelectorAll('[data-visao]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const alvo = document.querySelector('[data-agenda]');
    agenda(alvo, { ...JSON.parse(alvo.dataset.agenda || '{}'), visao: b.dataset.visao });
  });

  /* ── Série diária do mês (1 a 29/10; domingo fechado) ─────────────── */
  function serieMes(total) {
    const pesos = [0, 0.6, 0.8, 0.9, 1, 1.3, 1.6]; // dom..sáb
    const brutos = [];
    for (let d = 1; d <= 29; d++) {
      const dow = (d + 3) % 7; // 1/10/2026 é quinta
      brutos.push(pesos[dow] * (1 + (((d * 37) % 11) - 5) / 30));
    }
    const soma = brutos.reduce((a, b) => a + b, 0);
    const serie = brutos.map((b) => Math.round((b / soma) * total / 5) * 5);
    serie[28] += total - serie.reduce((a, b) => a + b, 0);
    return serie;
  }

  /* Barras em SVG com título acessível; a última barra (hoje) leva a classe "hoje". */
  function grafico(el, serie, rotulo) {
    const max = Math.max(...serie);
    const w = 12, gap = 6, h = 120;
    const barras = serie.map((v, i) => {
      const bh = v ? Math.max(3, (v / max) * h) : 2;
      return `<rect class="barra${i === serie.length - 1 ? ' hoje' : ''}${v ? '' : ' vazia'}" x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${bh}" rx="3"><title>${i + 1}/10: ${brl(v)}</title></rect>`;
    }).join('');
    el.innerHTML = `<svg viewBox="0 0 ${serie.length * (w + gap) - gap} ${h}" preserveAspectRatio="none" role="img" aria-label="${rotulo}">${barras}</svg>`;
  }

  const iniciais = (n) => n.split(' ').map((p) => p[0]).slice(0, 2).join('');

  window.P = { E, foto, brl, dur, icone, agenda, grafico, serieMes, iniciais, minutos, hora, STATUS, contraste, aplicarDestaque };
  montarPainel();
  aplicarDestaque();
  pintarBotoesTema();
})();
