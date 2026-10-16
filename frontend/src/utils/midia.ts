/**
 * Utilitários de mídia no navegador: verificação do tipo real do arquivo
 * (assinatura binária — "magic bytes"), compressão de imagens e formatação.
 *
 * A verificação aqui é a 1ª barreira (feedback imediato, evita upload inútil).
 * A barreira autoritativa é o servidor, que confere o formato detectado pelo
 * Cloudinary a partir do conteúdo do arquivo.
 */

export type TipoMidia = 'imagem' | 'video';

export const MIME_PERMITIDOS: Record<string, TipoMidia> = {
  'image/jpeg': 'imagem',
  'image/png': 'imagem',
  'image/webp': 'imagem',
  'video/mp4': 'video',
  'video/webm': 'video',
};

export const ACCEPT_MIDIA = '.jpg,.jpeg,.png,.webp,.mp4,.webm,image/jpeg,image/png,image/webp,video/mp4,video/webm';

const EXTENSAO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm',
};

/** Identifica o MIME real pelos primeiros bytes do arquivo. */
export function mimePorAssinatura(b: Uint8Array): string | null {
  const ascii = (ini: number, fim: number) => String.fromCharCode(...b.slice(ini, fim));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  if (ascii(4, 8) === 'ftyp') {
    // MP4/MOV/3GP compartilham o "ftyp"; descarta QuickTime (qt  ) e HEIC
    const marca = ascii(8, 12);
    if (['qt  ', 'heic', 'heix', 'mif1', 'msf1'].includes(marca)) return null;
    return 'video/mp4';
  }
  return null;
}

export interface ValidacaoArquivo {
  ok: boolean;
  erro?: string;
  mime?: string;
  tipo?: TipoMidia;
}

export const LIMITE_BYTES: Record<TipoMidia, number> = {
  imagem: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

/** Confere extensão, MIME declarado e conteúdo real, além do tamanho. */
export async function validarArquivo(file: File): Promise<ValidacaoArquivo> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeExt = EXTENSAO_MIME[ext];
  const cabecalho = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mimeReal = mimePorAssinatura(cabecalho);
  if (!mimeExt || !mimeReal || !MIME_PERMITIDOS[mimeReal]) {
    return { ok: false, erro: 'Tipo não permitido. Envie JPG, PNG, WEBP, MP4 ou WEBM.' };
  }
  if (MIME_PERMITIDOS[mimeExt] !== MIME_PERMITIDOS[mimeReal]) {
    return { ok: false, erro: 'A extensão do arquivo não corresponde ao conteúdo.' };
  }
  const tipo = MIME_PERMITIDOS[mimeReal];
  if (file.size > LIMITE_BYTES[tipo]) {
    return { ok: false, erro: `Arquivo muito grande (máx. ${formatarBytes(LIMITE_BYTES[tipo])}).` };
  }
  return { ok: true, mime: mimeReal, tipo };
}

/**
 * Reduz imagens grandes no navegador antes do upload: lado maior até 2048 px,
 * WEBP com qualidade 0,82. Mantém o original se a versão nova não ficar menor
 * ou se o navegador não suportar a conversão.
 */
export async function comprimirImagem(file: File, ladoMax = 2048, qualidade = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', qualidade));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    const nome = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], nome, { type: 'image/webp', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
