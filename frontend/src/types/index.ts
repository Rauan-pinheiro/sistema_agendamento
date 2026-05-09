export interface Empresa {
  id: number;
  nome_fantasia: string;
  slug: string;
  whatsapp_contato: string;
}

export interface Servico {
  id: number;
  empresa: number;
  nome: string;
  duracao_min: number;
  preco: string;
  criado_em: string;
  atualizado_em: string;
}

export type AgendamentoStatus = 'pendente' | 'confirmado' | 'cancelado';

export interface Agendamento {
  id: number;
  empresa: number;
  servico: number;
  servico_nome: string;
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
