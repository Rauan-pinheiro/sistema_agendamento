import api from './client';

/** Baixa todos os dados da conta em JSON (LGPD, portabilidade). */
export async function exportarDados(): Promise<Blob> {
  const { data } = await api.get('/conta/exportar/', { responseType: 'blob' });
  return data as Blob;
}

/** Exclui a conta e todos os dados da empresa. Exige a senha atual. */
export async function excluirConta(password: string): Promise<void> {
  await api.delete('/conta/', { data: { password } });
}

/** Remove nome e WhatsApp de um cliente dos agendamentos da empresa. */
export async function anonimizarCliente(whatsapp: string): Promise<number> {
  const { data } = await api.post<{ agendamentos: number }>('/clientes/anonimizar/', { whatsapp });
  return data.agendamentos;
}
