import api from './client';
import type { Empresa } from '../types';

export async function getMinhaEmpresa(): Promise<Empresa> {
  const { data } = await api.get<Empresa[]>('/empresa/');
  return data[0];
}

export async function updateEmpresa(id: number, payload: Partial<Empresa>): Promise<Empresa> {
  const { data } = await api.patch<Empresa>(`/empresa/${id}/`, payload);
  return data;
}
