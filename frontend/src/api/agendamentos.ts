import api from './client';
import type {
  Agendamento, AgendamentoStatus, AgendamentoVolume, AgendamentosResumo, PaginatedResponse,
} from '../types';

export interface ListAgendamentosParams {
  status?: AgendamentoStatus;
  data_inicio?: string; // YYYY-MM-DD (fuso local da empresa)
  data_fim?: string;    // YYYY-MM-DD, inclusivo
  ordem?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export async function listAgendamentos(
  params: ListAgendamentosParams = {},
): Promise<PaginatedResponse<Agendamento>> {
  const { data } = await api.get<PaginatedResponse<Agendamento>>('/agendamentos/', { params });
  return data;
}

/** Contadores leves usados no cabeçalho e no polling do painel. */
export async function getAgendamentosResumo(): Promise<AgendamentosResumo> {
  const { data } = await api.get<AgendamentosResumo>('/agendamentos/resumo/');
  return data;
}

export async function updateStatus(id: number, status: AgendamentoStatus): Promise<Agendamento> {
  const { data } = await api.patch<Agendamento>(`/agendamentos/${id}/status/`, { status });
  return data;
}

export async function deleteAgendamento(id: number): Promise<void> {
  await api.delete(`/agendamentos/${id}/`);
}

export async function getAgendamentosVolume(): Promise<AgendamentoVolume> {
  const { data } = await api.get<AgendamentoVolume>('/agendamentos/volume/');
  return data;
}
