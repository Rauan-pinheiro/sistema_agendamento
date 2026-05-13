import api from './client';
import type { Profissional, PaginatedResponse } from '../types';

export async function listProfissionais(page = 1): Promise<PaginatedResponse<Profissional>> {
  const { data } = await api.get<PaginatedResponse<Profissional>>('/profissionais/', {
    params: { page },
  });
  return data;
}

export async function createProfissional(
  payload: Pick<Profissional, 'nome' | 'especialidade' | 'ativo'>,
): Promise<Profissional> {
  const { data } = await api.post<Profissional>('/profissionais/', payload);
  return data;
}

export async function updateProfissional(
  id: number,
  payload: Partial<Pick<Profissional, 'nome' | 'especialidade' | 'ativo'>>,
): Promise<Profissional> {
  const { data } = await api.patch<Profissional>(`/profissionais/${id}/`, payload);
  return data;
}

export async function deleteProfissional(id: number): Promise<void> {
  await api.delete(`/profissionais/${id}/`);
}

export async function getFinanceiroResumo(mes?: string) {
  const { data } = await api.get('/financeiro/resumo/', mes ? { params: { mes } } : undefined);
  return data;
}
