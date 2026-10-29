import api from './client';
import { enviarArquivo } from './anexos';
import type { AssinaturaUpload, Empresa, Profissional } from '../types';
import { comprimirImagem, validarArquivo } from '../utils/midia';

/**
 * Capa, logo e foto de profissional: valida pelo conteúdo, comprime no navegador,
 * pede a assinatura, envia direto ao armazenamento e confirma no servidor.
 */
async function enviarImagem<T>(base: string, file: File, onProgresso: (pct: number) => void): Promise<T> {
  const v = await validarArquivo(file);
  if (!v.ok) throw new Error(v.erro);
  if (v.tipo !== 'imagem') throw new Error('Envie uma foto (JPG, PNG ou WEBP).');
  const arquivo = await comprimirImagem(file);
  const { data: assinatura } = await api.post<AssinaturaUpload>(`${base}/assinatura/`, {
    nome: arquivo.name, mime: arquivo.type || v.mime, tamanho: arquivo.size,
  });
  const { public_id } = await enviarArquivo(arquivo, assinatura, onProgresso);
  const { data } = await api.post<T>(`${base}/`, { public_id });
  return data;
}

export type ImagemEmpresa = 'capa' | 'logo';

export const enviarImagemEmpresa = (empresaId: number, campo: ImagemEmpresa, file: File, onProgresso: (p: number) => void) =>
  enviarImagem<Empresa>(`/empresa/${empresaId}/${campo}`, file, onProgresso);

export async function removerImagemEmpresa(empresaId: number, campo: ImagemEmpresa): Promise<Empresa> {
  const { data } = await api.delete<Empresa>(`/empresa/${empresaId}/${campo}/`);
  return data;
}

export const enviarFotoProfissional = (id: number, file: File, onProgresso: (p: number) => void) =>
  enviarImagem<Profissional>(`/profissionais/${id}/foto`, file, onProgresso);

export async function removerFotoProfissional(id: number): Promise<Profissional> {
  const { data } = await api.delete<Profissional>(`/profissionais/${id}/foto/`);
  return data;
}
