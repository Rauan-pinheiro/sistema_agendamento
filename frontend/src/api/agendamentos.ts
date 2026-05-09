import api from './client';
import type { Agendamento, AgendamentoStatus } from '../types';

export async function listAgendamentos(status?: AgendamentoStatus): Promise<Agendamento[]> {
  const { data } = await api.get<Agendamento[]>('/agendamentos/', {
    params: status ? { status } : {},
  });
  return data;
}

export async function updateStatus(id: number, status: AgendamentoStatus): Promise<Agendamento> {
  const { data } = await api.patch<Agendamento>(`/agendamentos/${id}/status/`, { status });
  return data;
}
