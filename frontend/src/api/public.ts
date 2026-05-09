import api from './client';
import type { Empresa, Servico, Agendamento } from '../types';

export async function getEmpresaPublica(slug: string): Promise<Empresa> {
  const { data } = await api.get<Empresa>(`/public/${slug}/`);
  return data;
}

export async function listServicosPublicos(slug: string): Promise<Servico[]> {
  const { data } = await api.get<Servico[]>(`/public/${slug}/servicos/`);
  return data;
}

export async function createAgendamentoPublico(
  slug: string,
  payload: { servico: number; nome_cliente: string; whatsapp_cliente: string; data_hora: string },
): Promise<Agendamento> {
  const { data } = await api.post<Agendamento>(`/public/${slug}/agendamentos/`, payload);
  return data;
}
