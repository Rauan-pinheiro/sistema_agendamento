import api from './client';
import type { AuthTokens, RegistroPayload, Empresa } from '../types';

export async function login(username: string, password: string): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/auth/token/', { username, password });
  return data;
}

export async function registro(
  payload: RegistroPayload,
): Promise<AuthTokens & { empresa: Empresa }> {
  const { data } = await api.post('/auth/registro/', payload);
  return data;
}
