import { listAgendamentos } from '../../../api/agendamentos';
import type { Agendamento } from '../../../types';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/** Data local YYYY-MM-DD. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function deIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function somarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
/** Segunda-feira da semana de `d`. */
export function inicioSemana(d: Date): Date {
  return somarDias(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
}

/** "Quinta, 29 de outubro" */
export function tituloDia(d: Date): string {
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** Intervalo da semana (segunda a domingo): "26 de outubro a 1º de novembro", "2 a 8 de novembro". */
export function tituloSemana(inicio: Date): string {
  const fim = somarDias(inicio, 6);
  const dia = (d: Date) => (d.getDate() === 1 ? '1º' : String(d.getDate()));
  if (inicio.getFullYear() !== fim.getFullYear()) {
    return `${dia(inicio)} de ${MESES[inicio.getMonth()]} de ${inicio.getFullYear()} a ${dia(fim)} de ${MESES[fim.getMonth()]} de ${fim.getFullYear()}`;
  }
  if (inicio.getMonth() !== fim.getMonth()) {
    return `${dia(inicio)} de ${MESES[inicio.getMonth()]} a ${dia(fim)} de ${MESES[fim.getMonth()]}`;
  }
  return `${dia(inicio)} a ${dia(fim)} de ${MESES[fim.getMonth()]}`;
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
/** Minutos desde a meia-noite (hora local). */
export function minutosDoDia(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
export function brl(v: number | string): string {
  const n = Number(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: n % 1 ? 2 : 0 });
}
export function nomesServicos(ag: Agendamento): string {
  return ag.servicos_info?.length ? ag.servicos_info.map((s) => s.nome).join(' + ') : (ag.servico_nome ?? 'Serviço');
}

/** Paleta de serviços: tons distintos que funcionam nos dois temas (usados misturados à superfície). */
export const PALETA_SERVICOS = ['#3B6FD8', '#8A4FD1', '#2E8A6E', '#C2671D', '#C23B6B', '#1F8FA8', '#7A7F2A', '#A0522D'];
export function corDoServico(servicoId: number | null | undefined): string {
  return PALETA_SERVICOS[Math.abs(servicoId ?? 0) % PALETA_SERVICOS.length];
}

/** Todos os agendamentos do intervalo (inclusivo), percorrendo as páginas da API. */
export async function carregarIntervalo(inicio: string, fim: string): Promise<Agendamento[]> {
  const todos: Agendamento[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await listAgendamentos({ data_inicio: inicio, data_fim: fim, ordem: 'asc', page, page_size: 100 });
    todos.push(...r.results);
    if (!r.next) break;
  }
  return todos.filter((a) => a.status !== 'arquivado');
}
