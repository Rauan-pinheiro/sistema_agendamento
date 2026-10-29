import axios from 'axios';
import { API_BASE } from './base';
import type {
  Empresa,
  Servico,
  Agendamento,
  ProfissionalPublico,
  PaginatedResponse,
  PaginaPublica,
  SlotDisponivel,
} from '../types';

// Cliente sem JWT — rotas públicas não devem disparar o interceptor de 401/redirect
const publicApi = axios.create({ baseURL: API_BASE });

const adiantadas = new Map<string, Promise<PaginaPublica>>();

/** Empresa + serviços + profissionais em uma única requisição (com cache no servidor). */
export async function getPaginaPublica(slug: string): Promise<PaginaPublica> {
  const adiantada = adiantadas.get(slug);
  if (adiantada) {
    adiantadas.delete(slug); // usa só uma vez: "tentar de novo" faz uma requisição nova
    return adiantada;
  }
  const { data } = await publicApi.get<PaginaPublica>(`/public/${slug}/pagina/`);
  return data;
}

/**
 * Começa a buscar a página pública antes de o React montar a rota (chamado em main.tsx) e,
 * quando os dados chegam, pré-carrega a capa no tamanho certo. Encurta o caminho até o LCP.
 */
export function adiantarPaginaPublica(slug: string): void {
  const p = publicApi.get<PaginaPublica>(`/public/${slug}/pagina/`).then((r) => r.data);
  p.then((d) => {
    const capa = d.empresa.capa;
    if (!capa) return;
    const link = document.createElement('link');
    Object.assign(link, { rel: 'preload', as: 'image', href: capa.url, imageSrcset: capa.srcset, imageSizes: '100vw' });
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
  }).catch(() => {});
  adiantadas.set(slug, p);
}

export async function getEmpresaPublica(slug: string): Promise<Empresa> {
  const { data } = await publicApi.get<Empresa>(`/public/${slug}/`);
  return data;
}

export async function listServicosPublicos(slug: string): Promise<Servico[]> {
  const { data } = await publicApi.get<PaginatedResponse<Servico>>(`/public/${slug}/servicos/`);
  return data.results;
}

export async function listProfissionaisPublicos(slug: string): Promise<ProfissionalPublico[]> {
  const { data } = await publicApi.get<ProfissionalPublico[]>(`/public/${slug}/profissionais/`);
  return data;
}

export async function createAgendamentoPublico(
  slug: string,
  payload: {
    servicos_ids: number[];
    profissional?: number | null;
    nome_cliente: string;
    whatsapp_cliente: string;
    data_hora: string;
  },
): Promise<Agendamento> {
  const { data } = await publicApi.post<Agendamento>(`/public/${slug}/agendamentos/`, payload);
  return data;
}

export async function getHorariosDisponiveis(
  slug: string,
  data: string,
  servicos_ids?: number[],
  profissional_id?: number | null,
): Promise<{ data: string; slots: SlotDisponivel[]; fechado?: boolean }> {
  const params: Record<string, string> = { data };
  if (servicos_ids && servicos_ids.length > 0) params.servicos_ids = servicos_ids.join(',');
  if (profissional_id) params.profissional_id = String(profissional_id);
  const { data: response } = await publicApi.get(
    `/public/${slug}/horarios-disponiveis/`,
    { params },
  );
  return response;
}
