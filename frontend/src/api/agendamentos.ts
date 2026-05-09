import api from './client';
import type { Agendamento, AgendamentoStatus, PaginatedResponse } from '../types';

export async function listAgendamentos(status?: AgendamentoStatus): Promise<Agendamento[]> {
  const { data } = await api.get<PaginatedResponse<Agendamento>>('/agendamentos/', {
    params: status ? { status } : {},
  });
  return data.results;
}

export async function updateStatus(id: number, status: AgendamentoStatus): Promise<Agendamento> {
  const { data } = await api.patch<Agendamento>(`/agendamentos/${id}/status/`, { status });
  return data;
}
