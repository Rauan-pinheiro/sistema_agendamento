import api from './client';
import type { HorarioFuncionamento } from '../types';

type HorarioPayload = Pick<HorarioFuncionamento, 'dia_semana' | 'hora_inicio' | 'hora_fim' | 'intervalo_min'> & {
  profissional?: number | null;
};

export async function listHorarios(profissionalId?: number | 'null'): Promise<HorarioFuncionamento[]> {
  const params: Record<string, unknown> = {};
  if (profissionalId !== undefined) params.profissional_id = profissionalId;
  const { data } = await api.get<HorarioFuncionamento[]>('/horarios/', { params });
  return data;
}

export async function createHorario(payload: HorarioPayload): Promise<HorarioFuncionamento> {
  const { data } = await api.post<HorarioFuncionamento>('/horarios/', payload);
  return data;
}

export async function updateHorario(id: number, payload: Partial<HorarioPayload>): Promise<HorarioFuncionamento> {
  const { data } = await api.patch<HorarioFuncionamento>(`/horarios/${id}/`, payload);
  return data;
}

export async function deleteHorario(id: number): Promise<void> {
  await api.delete(`/horarios/${id}/`);
}
