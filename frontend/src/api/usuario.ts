import api from './client';
import type { PerfilUsuario } from '../types';

export interface AtualizarPerfilPayload {
  username?: string;
  email?: string;
  password_atual?: string;
  password_nova?: string;
  password_nova_confirm?: string;
}

export async function getPerfilUsuario(): Promise<PerfilUsuario> {
  const { data } = await api.get<PerfilUsuario>('/usuario/');
  return data;
}

export async function updatePerfilUsuario(payload: AtualizarPerfilPayload): Promise<PerfilUsuario> {
  const { data } = await api.patch<PerfilUsuario>('/usuario/', payload);
  return data;
}
