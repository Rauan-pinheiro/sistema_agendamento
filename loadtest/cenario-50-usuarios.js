/**
 * Teste de carga — 50 usuários simultâneos nos fluxos principais.
 *
 *   35 VUs  cliente final: abre a página pública, consulta horários e agenda
 *   10 VUs  dono: painel (agendamentos, financeiro, volume, serviços)
 *    5 VUs  login repetido do dono
 *
 * Uso:  k6 run -e BASE_URL=http://localhost:8000 -e EMPRESAS=10 cenario-50-usuarios.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://localhost:8000') + '/api/v1';
const EMPRESAS = Number(__ENV.EMPRESAS || 10);
const DURACAO = __ENV.DURACAO || '2m';
const SENHA = 'Carga-123!';
// MODO=otimizado reproduz o front da Fase 1 (endpoint público unificado, painel filtrado
// no servidor e polling via /resumo). Padrão = front original.
const OTIMIZADO = __ENV.MODO === 'otimizado';
const hojeISO = () => new Date().toISOString().slice(0, 10);

const ENDPOINTS = ['public_pagina', 'painel_resumo',
  'public_empresa', 'public_servicos', 'public_profissionais', 'public_horarios',
  'public_criar_agendamento', 'painel_agendamentos', 'painel_financeiro', 'painel_volume',
  'painel_servicos', 'login'];
// Submétricas por endpoint só aparecem no resumo se houver threshold associado.
const porEndpoint = Object.fromEntries(ENDPOINTS.flatMap((n) => [
  [`http_req_duration{name:${n}}`, ['max>=0']], [`http_reqs{name:${n}}`, ['count>=0']],
]));

export const options = {
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    cliente: { executor: 'constant-vus', vus: 35, duration: DURACAO, exec: 'cliente' },
    dono:    { executor: 'constant-vus', vus: 10, duration: DURACAO, exec: 'dono' },
    login:   { executor: 'constant-vus', vus: 5,  duration: DURACAO, exec: 'login' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{fluxo:cliente}': ['p(95)<1500'],
    'http_req_duration{fluxo:dono}': ['p(95)<1500'],
    ...porEndpoint,
  },
};

const rand = (n) => Math.floor(Math.random() * n);
const slugAleatorio = () => `carga-${1 + rand(EMPRESAS)}`;

function dataFutura() {
  const d = new Date(Date.now() + (1 + rand(21)) * 86400000);
  return d.toISOString().slice(0, 10);
}

export function setup() {
  const tokens = [];
  for (let i = 1; i <= EMPRESAS; i++) {
    const r = http.post(`${BASE}/auth/token/`, JSON.stringify({ username: `dono_carga_${i}`, password: SENHA }),
      { headers: { 'Content-Type': 'application/json' }, timeout: '120s' });
    tokens.push(r.json('access'));
  }
  return { tokens };
}

export function cliente() {
  const slug = slugAleatorio();
  const tag = (name) => ({ tags: { fluxo: 'cliente', name } });

  // Carregamento inicial da página pública
  let servicos;
  if (OTIMIZADO) {
    const pag = http.get(`${BASE}/public/${slug}/pagina/`, tag('public_pagina'));
    if (!check(pag, { 'pagina 200': (r) => r.status === 200 })) return;
    servicos = pag.json('servicos') || [];
  } else {
    // Front original: 3 requisições em paralelo
    const [emp, svcs] = http.batch([
      ['GET', `${BASE}/public/${slug}/`, null, tag('public_empresa')],
      ['GET', `${BASE}/public/${slug}/servicos/`, null, tag('public_servicos')],
      ['GET', `${BASE}/public/${slug}/profissionais/`, null, tag('public_profissionais')],
    ]);
    check(emp, { 'empresa 200': (r) => r.status === 200 });
    if (!check(svcs, { 'servicos 200': (r) => r.status === 200 })) return;
    servicos = svcs.json('results') || [];
  }
  sleep(1 + Math.random() * 2);

  if (!servicos.length) return;
  const ids = [servicos[rand(servicos.length)].id];
  const data = dataFutura();
  const h = http.get(`${BASE}/public/${slug}/horarios-disponiveis/?data=${data}&servicos_ids=${ids.join(',')}`,
    tag('public_horarios'));
  check(h, { 'horarios 200': (r) => r.status === 200 });
  const livres = (h.json('slots') || []).filter((s) => s.disponivel);
  sleep(1 + Math.random() * 2);
  if (!livres.length) return;

  const slot = livres[rand(livres.length)];
  const r = http.post(`${BASE}/public/${slug}/agendamentos/`, JSON.stringify({
    servicos_ids: ids, nome_cliente: 'Cliente Carga', whatsapp_cliente: '85988887777', data_hora: slot.datetime,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { fluxo: 'cliente', name: 'public_criar_agendamento' },
    // 400 = horário tomado por outro VU entre a consulta e o envio (comportamento esperado)
    responseCallback: http.expectedStatuses(201, 400),
  });
  check(r, { 'agendamento 201/400': (x) => x.status === 201 || x.status === 400 });
  sleep(1 + Math.random() * 2);
}

export function dono(data) {
  const token = data.tokens[rand(data.tokens.length)];
  const p = { headers: { Authorization: `Bearer ${token}` } };
  const tag = (name) => Object.assign({ tags: { fluxo: 'dono', name } }, p);

  const lista = OTIMIZADO
    ? `${BASE}/agendamentos/?data_inicio=${hojeISO()}&page_size=50`
    : `${BASE}/agendamentos/`;
  const r = http.get(lista, tag('painel_agendamentos'));
  check(r, { 'painel 200': (x) => x.status === 200 });
  // Polling do painel: original recarrega a lista inteira; otimizado consulta só o resumo
  if (OTIMIZADO) http.get(`${BASE}/agendamentos/resumo/`, tag('painel_resumo'));
  else http.get(`${BASE}/agendamentos/`, tag('painel_agendamentos'));
  sleep(1 + Math.random() * 2);
  http.batch([
    ['GET', `${BASE}/financeiro/resumo/`, null, tag('painel_financeiro')],
    ['GET', `${BASE}/agendamentos/volume/`, null, tag('painel_volume')],
  ]);
  sleep(1 + Math.random() * 2);
  http.get(`${BASE}/servicos/`, tag('painel_servicos'));
  sleep(2 + Math.random() * 3);
}

export function login() {
  const i = 1 + rand(EMPRESAS);
  const r = http.post(`${BASE}/auth/token/`, JSON.stringify({ username: `dono_carga_${i}`, password: SENHA }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { fluxo: 'login', name: 'login' },
    timeout: '60s',
  });
  check(r, { 'login 200': (x) => x.status === 200 });
  sleep(3 + Math.random() * 3);
}

export function handleSummary(data) {
  const out = __ENV.SAIDA || 'resultado.json';
  return { [out]: JSON.stringify(data, null, 2), stdout: textoResumo(data) };
}

function textoResumo(data) {
  const linhas = ['', 'endpoint                     reqs   p50(ms)  p95(ms)  max(ms)'];
  for (const [k, v] of Object.entries(data.metrics)) {
    const m = k.match(/^http_req_duration\{name:(.+)\}$/);
    if (!m) continue;
    const vals = v.values;
    linhas.push(`${m[1].padEnd(28)} ${String(data.metrics[`http_reqs{name:${m[1]}}`]?.values.count ?? '').padStart(5)} `
      + `${vals.med.toFixed(0).padStart(8)} ${vals['p(95)'].toFixed(0).padStart(8)} ${vals.max.toFixed(0).padStart(8)}`);
  }
  const f = data.metrics.http_req_failed.values.rate;
  linhas.push(`\nreqs total: ${data.metrics.http_reqs.values.count}  `
    + `(${data.metrics.http_reqs.values.rate.toFixed(1)}/s)  taxa de erro: ${(f * 100).toFixed(2)}%`);
  return linhas.join('\n') + '\n';
}
