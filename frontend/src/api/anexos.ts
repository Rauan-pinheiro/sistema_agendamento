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
 * Envia o arquivo direto do navegador ao armazenamento (o servidor não recebe o
 * arquivo). Usa XHR para reportar progresso; não envia o JWT do painel.
 */
export function enviarArquivo(
  file: File,
  a: AssinaturaUpload,
  onProgresso: (pct: number) => void,
  sinal?: AbortSignal,
): Promise<{ public_id: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // Contrato do back-end, independente do provedor: campos assinados + o arquivo por último
    for (const [chave, valor] of Object.entries(a.campos)) form.append(chave, valor);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', a.upload_url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        // O public_id é decidido pelo servidor; alguns provedores (S3/R2) respondem 204 sem corpo
        if (xhr.status >= 200 && xhr.status < 300) return resolve({ public_id: a.public_id });
        const corpo = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        reject(new Error(corpo?.error?.message || 'Falha no envio do arquivo.'));
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

export { mensagemDeErro } from '../utils/erros';
