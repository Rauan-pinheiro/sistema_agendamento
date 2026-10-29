export interface Empresa {
  id: number;
  nome_fantasia: string;
  slug: string;
  whatsapp_contato: string;
  /** Cor de destaque da página pública (#RRGGBB). */
  cor_destaque: string;
  /** Capa da página pública em srcset; null sem foto (a página usa o gradiente da cor). */
  capa?: { url: string; srcset: string } | null;
  logo_url?: string | null;
}

export interface Profissional {
  id: number;
  empresa: number;
  nome: string;
  especialidade: string;
  ativo: boolean;
  foto_url?: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Versão pública — retornada por /public/<slug>/profissionais/ */
export interface ProfissionalPublico {
  id: number;
  nome: string;
  especialidade: string;
  foto_url?: string | null;
}

export interface Servico {
  id: number;
  empresa: number;
  nome: string;
  descricao: string;
  duracao_min: number;
  preco: string;
  criado_em: string;
  atualizado_em: string;
}

export interface AgendamentoVolume {
  por_dia_semana: Array<{ dia: string; total: number }>;
  por_hora: Array<{ hora: number; total: number }>;
}

export interface AgendamentosResumo {
  hoje: number;
  pendentes: number;
  ultimo_criado_em: string | null;
}

/** Resposta de /public/<slug>/pagina/ — tudo que a página pública carrega de início. */
export interface PaginaPublica {
  empresa: Empresa;
  servicos: ServicoPublico[];
  profissionais: ProfissionalPublico[];
}

export type ServicoPublico = Pick<Servico, 'id' | 'nome' | 'descricao' | 'duracao_min' | 'preco'> & {
  midias: MidiaServico[];
};

/** Mídia da vitrine do serviço (URLs públicas). */
export interface MidiaServico {
  id: number;
  tipo: 'imagem' | 'video' | 'youtube';
  url: string | null;
  thumb_url: string | null;
  embed_url: string | null;
  youtube_id: string;
  largura: number | null;
  altura: number | null;
  duracao_seg: number | null;
  ordem: number;
  // Somente na visão do dono
  formato?: string;
  bytes?: number;
  nome_original?: string;
}

export type AgendamentoStatus = 'pendente' | 'confirmado' | 'cancelado' | 'arquivado';

export interface ServicoInfo {
  id: number;
  nome: string;
  duracao_min: number;
  preco: string;
}

export interface Agendamento {
  id: number;
  empresa: number;
  servico: number | null;
  servico_nome: string | null;
  servico_preco: string | null;
  servicos_info: ServicoInfo[];
  duracao_total_min: number;
  preco_total: string;
  /** Quantidade de fotos/vídeos anexados (só no painel). */
  total_anexos?: number;
  profissional: number | null;
  profissional_nome: string | null;
  nome_cliente: string;
  whatsapp_cliente: string;
  data_hora: string;
  status: AgendamentoStatus;
  criado_em: string;
  atualizado_em: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface RegistroPayload {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  nome_fantasia: string;
  slug: string;
  whatsapp_contato: string;
  aceite_termos?: boolean;
}

export interface HorarioFuncionamento {
  id: number;
  empresa: number;
  profissional: number | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  intervalo_min: number;
  criado_em: string;
  atualizado_em: string;
}

export interface SlotDisponivel {
  hora: string;
  datetime: string;
  disponivel: boolean;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PerfilUsuario {
  username: string;
  email: string;
}

export interface FinanceiroResumo {
  mes_referencia: string;            // "YYYY-MM"
  total_agendamentos: number;
  agendamentos_confirmados: number;
  agendamentos_cancelados: number;
  agendamentos_pendentes: number;
  receita_bruta: string;             // "1250.00"
  ticket_medio: string;              // "250.00"
  taxa_confirmacao: number;          // 0–100
  por_dia: Array<{ dia: string; total: number; receita: string }>;
  por_servico: Array<{ servico: string; total: number; receita: string }>;
}

export interface Anexo {
  id: number;
  tipo: 'imagem' | 'video';
  formato: string;
  bytes: number;
  largura: number | null;
  altura: number | null;
  duracao_seg: number | null;
  nome_original: string;
  criado_em: string;
  url: string | null;
  thumb_url: string | null;
}

export interface CotaAnexos {
  arquivos: number;
  bytes: number;
  max_arquivos: number;
  max_bytes: number;
}

export interface AnexosResposta {
  anexos: Anexo[];
  cota: CotaAnexos;
}

/** Parâmetros assinados pelo servidor para o upload direto ao Cloudinary. */
/** Descritor de upload direto: POST multipart em upload_url com `campos` + o arquivo. */
export interface AssinaturaUpload {
  public_id: string;
  upload_url: string;
  campos: Record<string, string>;
  max_bytes: number;
  tipo: 'imagem' | 'video';
  nome: string;
}
