import api from './client';
import type { Empresa, Servico, Agendamento, PaginatedResponse, SlotDisponivel } from '../types';

export async function getEmpresaPublica(slug: string): Promise<Empresa> {
  const { data } = await api.get<Empresa>(`/public/${slug}/`);
  return data;
}

export async function listServicosPublicos(slug: string): Promise<Servico[]> {
  const { data } = await api.get<PaginatedResponse<Servico>>(`/public/${slug}/servicos/`);
  return data.results;
}

export async function createAgendamentoPublico(
  slug: string,
  payload: { servico: number; nome_cliente: string; whatsapp_cliente: string; data_hora: string },
): Promise<Agendamento> {
  const { data } = await api.post<Agendamento>(`/public/${slug}/agendamentos/`, payload);
  return data;
}

export async function getHorariosDisponiveis(
  slug: string,
  data: string,
  servico_id?: number,
): Promise<{ data: string; slots: SlotDisponivel[] }> {
  const params: Record<string, string> = { data };
  if (servico_id) params.servico_id = String(servico_id);
  const { data: response } = await api.get(`/public/${slug}/horarios-disponiveis/`, { params });
  return response;
}
