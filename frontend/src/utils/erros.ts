/** Mensagens de erro amigáveis a partir de qualquer falha (resposta da API, rede ou Error). */

interface ErroHttp {
  isAxiosError?: boolean;
  message?: string;
  response?: { status?: number; data?: unknown };
}

const PADRAO = 'Não foi possível concluir. Tente novamente.';

function primeiraMensagem(dados: unknown): string | null {
  if (!dados || typeof dados !== 'object') return null;
  const obj = dados as Record<string, unknown>;
  const valor = obj.erro ?? obj.detail ?? Object.values(obj)[0];
  if (Array.isArray(valor)) return valor.length ? primeiraMensagem({ v: valor[0] }) ?? String(valor[0]) : null;
  if (typeof valor === 'string') return valor;
  if (valor && typeof valor === 'object') return primeiraMensagem(valor);
  return null;
}

export function mensagemDeErro(err: unknown, padrao = PADRAO): string {
  const e = err as ErroHttp | null;
  if (e?.isAxiosError) {
    const status = e.response?.status;
    if (!e.response) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
    if (status === 429) return 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.';
    if (status && status >= 500) return 'O servidor teve um problema. Tente de novo em instantes.';
    return primeiraMensagem(e.response.data) ?? padrao;
  }
  if (err instanceof Error && err.message) return err.message;
  return padrao;
}
