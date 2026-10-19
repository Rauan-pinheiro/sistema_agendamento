import { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../client';

const resposta401: AxiosAdapter = async (config) => {
  throw new AxiosError('401', 'ERR_BAD_REQUEST', config, null, {
    status: 401, statusText: 'Unauthorized', headers: {}, config, data: { detail: 'x' },
  });
};

describe('interceptor de 401', () => {
  const location = { href: '/login' };
  beforeEach(() => {
    const dados = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => dados.set(k, v),
      removeItem: (k: string) => dados.delete(k),
      clear: () => dados.clear(),
    });
    vi.stubGlobal('window', { location });
    location.href = '/login';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('senha errada no login não recarrega a página (o erro precisa aparecer)', async () => {
    location.href = '/login?sentinela';
    await expect(api.post('/auth/token/', {}, { adapter: resposta401 })).rejects.toMatchObject({ response: { status: 401 } });
    expect(location.href).toBe('/login?sentinela');
  });

  it('sessão expirada sem refresh token manda para o login', async () => {
    location.href = '/dashboard';
    await expect(api.get('/agendamentos/', { adapter: resposta401 })).rejects.toBeTruthy();
    expect(location.href).toBe('/login');
  });
});
