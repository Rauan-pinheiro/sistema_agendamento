/**
 * Corrida pelo mesmo horário: 30 clientes enviam, ao mesmo tempo, um agendamento
 * para o MESMO slot. O correto é exatamente 1 sucesso (201) e 29 recusas (400).
 */
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:8000') + '/api/v1';
const sucessos = new Counter('agendamentos_aceitos');
const recusas = new Counter('agendamentos_recusados');

export const options = {
  scenarios: { corrida: { executor: 'per-vu-iterations', vus: 30, iterations: 1, maxDuration: '3m' } },
};

export function setup() {
  const svcs = http.get(`${BASE}/public/carga-1/servicos/`).json('results');
  const data = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const slots = http.get(`${BASE}/public/carga-1/horarios-disponiveis/?data=${data}&servicos_ids=${svcs[0].id}`)
    .json('slots').filter((s) => s.disponivel);
  return { servico: svcs[0].id, slot: slots[0].datetime };
}

export default function (d) {
  const r = http.post(`${BASE}/public/carga-1/agendamentos/`, JSON.stringify({
    servicos_ids: [d.servico], nome_cliente: 'Cliente Carga', whatsapp_cliente: '85988887777', data_hora: d.slot,
  }), { headers: { 'Content-Type': 'application/json' }, timeout: '170s',
        responseCallback: http.expectedStatuses(201, 400) });
  (r.status === 201 ? sucessos : recusas).add(1);
}
