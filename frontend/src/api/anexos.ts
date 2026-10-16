import api from './client';
import type { Anexo, AnexosResposta, AssinaturaUpload } from '../types';
import type { TipoMidia } from '../utils/midia';

export async function listAnexos(agendamentoId: number): Promise<AnexosResposta> {
  const { data } = await api.get<AnexosResposta>(`/agendamentos/${agendamentoId}/anexos/`);
  return data;
}

export async function pedirAssinatura(
  agendamentoId: number,
  arquivo: { nome: string; mime: string; tamanho: number },
  substituirId?: number,
): Promise<AssinaturaUpload> {
  const { data } = await api.post<AssinaturaUpload>(
    `/agendamentos/${agendamentoId}/anexos/assinatura/`,
    { ...arquivo, substituir_id: substituirId },
  );
  return data;
}

/**
 * Envia o arquivo direto do navegador para o Cloudinary (o servidor não recebe
 * o arquivo). Usa XHR para reportar progresso; não envia o JWT do painel.
 */
export function enviarParaCloudinary(
  file: File,
  a: AssinaturaUpload,
  onProgresso: (pct: number) => void,
  sinal?: AbortSignal,
): Promise<{ public_id: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', a.api_key);
    form.append('timestamp', String(a.timestamp));
    form.append('signature', a.signature);
    form.append('public_id', a.public_id);
    form.append('type', a.type);
    form.append('allowed_formats', a.allowed_formats);
    form.append('overwrite', a.overwrite);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', a.upload_url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const corpo = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve({ public_id: corpo.public_id });
        else reject(new Error(corpo?.error?.message || 'Falha no envio do arquivo.'));
      } catch {
        reject(new Error('Resposta inválida do armazenamento.'));
      }
    };
    xhr.onerror = () => reject(new Error('Falha de rede durante o envio.'));
    xhr.onabort = () => reject(new DOMException('Envio cancelado.', 'AbortError'));
    sinal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

export async function confirmarAnexo(
  agendamentoId: number,
  payload: { public_id: string; tipo: TipoMidia; nome: string; substituir_id?: number },
): Promise<Anexo> {
  const { data } = await api.post<Anexo>(`/agendamentos/${agendamentoId}/anexos/`, payload);
  return data;
}

export async function removerAnexo(agendamentoId: number, anexoId: number): Promise<void> {
  await api.delete(`/agendamentos/${agendamentoId}/anexos/${anexoId}/`);
}

/** Extrai a mensagem de erro amigável de uma resposta da API. */
export function mensagemDeErro(err: unknown, padrao = 'Não foi possível concluir. Tente novamente.'): string {
  const dados = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (dados) {
    const valor = dados.erro ?? Object.values(dados)[0];
    if (Array.isArray(valor)) return String(valor[0]);
    if (typeof valor === 'string') return valor;
  }
  if (err instanceof Error && err.message) return err.message;
  return padrao;
}
