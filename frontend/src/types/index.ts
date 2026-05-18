export interface Empresa {
  id: number;
  nome_fantasia: string;
  slug: string;
  whatsapp_contato: string;
}

export interface Profissional {
  id: number;
  empresa: number;
  nome: string;
  especialidade: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

/** Versão pública — retornada por /public/<slug>/profissionais/ */
export interface ProfissionalPublico {
  id: number;
  nome: string;
  especialidade: string;
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

export type AgendamentoStatus = 'pendente' | 'confirmado' | 'cancelado' | 'arquivado';

export interface Agendamento {
  id: number;
  empresa: number;
  servico: number;
  servico_nome: string;
  servico_preco: string;
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
