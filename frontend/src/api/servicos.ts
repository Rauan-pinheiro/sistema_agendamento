import api from './client';
import type { Servico, PaginatedResponse } from '../types';

type ServicoPayload = Pick<Servico, 'nome' | 'descricao' | 'duracao_min' | 'preco'>;

export async function listServicos(): Promise<Servico[]> {
  const { data } = await api.get<PaginatedResponse<Servico>>('/servicos/');
  return data.results;
}

export async function createServico(payload: ServicoPayload): Promise<Servico> {
  const { data } = await api.post<Servico>('/servicos/', payload);
  return data;
}

export async function updateServico(id: number, payload: Partial<ServicoPayload>): Promise<Servico> {
  const { data } = await api.patch<Servico>(`/servicos/${id}/`, payload);
  return data;
}

export async function deleteServico(id: number): Promise<void> {
  await api.delete(`/servicos/${id}/`);
}
