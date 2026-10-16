import api from './client';
import type { AssinaturaUpload, MidiaServico, PaginatedResponse, Servico } from '../types';
import type { TipoMidia } from '../utils/midia';

type ServicoPayload = Pick<Servico, 'nome' | 'descricao' | 'duracao_min' | 'preco'>;

/** Lista todos os serviços do dono (até 100; antes vinha só a 1ª página de 20). */
export async function listServicos(): Promise<Servico[]> {
  const { data } = await api.get<PaginatedResponse<Servico>>('/servicos/', { params: { page_size: 100 } });
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

// ── Vitrine do serviço ("Ver mais") ─────────────────────────────────────────

export async function listMidiasServico(servicoId: number): Promise<MidiaServico[]> {
  const { data } = await api.get<MidiaServico[]>(`/servicos/${servicoId}/midias/`);
  return data;
}

export async function assinarMidiaServico(
  servicoId: number, arquivo: { nome: string; mime: string; tamanho: number },
): Promise<AssinaturaUpload> {
  const { data } = await api.post<AssinaturaUpload>(`/servicos/${servicoId}/midias/assinatura/`, arquivo);
  return data;
}

export async function confirmarMidiaServico(
  servicoId: number, payload: { public_id: string; tipo: TipoMidia; nome: string },
): Promise<MidiaServico> {
  const { data } = await api.post<MidiaServico>(`/servicos/${servicoId}/midias/`, payload);
  return data;
}

export async function adicionarYoutube(servicoId: number, youtubeUrl: string): Promise<MidiaServico> {
  const { data } = await api.post<MidiaServico>(`/servicos/${servicoId}/midias/`, { youtube_url: youtubeUrl });
  return data;
}

export async function reordenarMidiasServico(servicoId: number, ids: number[]): Promise<void> {
  await api.patch(`/servicos/${servicoId}/midias/ordem/`, { ids });
}

export async function removerMidiaServico(servicoId: number, midiaId: number): Promise<void> {
  await api.delete(`/servicos/${servicoId}/midias/${midiaId}/`);
}
