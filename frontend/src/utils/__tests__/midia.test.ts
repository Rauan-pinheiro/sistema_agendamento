import { describe, expect, it } from 'vitest';
import { formatarBytes, mimePorAssinatura, validarArquivo } from '../midia';

const bytes = (...v: number[]) => new Uint8Array([...v, ...new Array(16).fill(0)].slice(0, 16));
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'));
const MP4 = bytes(0, 0, 0, 0x20, ...ascii('ftypisom'));
const MOV = bytes(0, 0, 0, 0x14, ...ascii('ftypqt  '));
const WEBM = bytes(0x1a, 0x45, 0xdf, 0xa3);
const GIF = bytes(...ascii('GIF89a'));

function arquivo(nome: string, conteudo: Uint8Array, tamanho = conteudo.length, tipo = '') {
  const partes: BlobPart[] = [conteudo as BlobPart];
  if (tamanho > conteudo.length) partes.push(new Uint8Array(tamanho - conteudo.length));
  return new File(partes, nome, { type: tipo });
}

describe('mimePorAssinatura', () => {
  it.each([
    ['jpg', JPG, 'image/jpeg'], ['png', PNG, 'image/png'], ['webp', WEBP, 'image/webp'],
    ['mp4', MP4, 'video/mp4'], ['webm', WEBM, 'video/webm'],
  ])('reconhece %s', (_, b, mime) => expect(mimePorAssinatura(b)).toBe(mime));

  it('rejeita formatos fora da lista', () => {
    expect(mimePorAssinatura(GIF)).toBeNull();
    expect(mimePorAssinatura(MOV)).toBeNull();
    expect(mimePorAssinatura(bytes(...ascii('%PDF-1.7')))).toBeNull();
  });
});

describe('validarArquivo', () => {
  it('aceita imagem válida', async () => {
    expect(await validarArquivo(arquivo('foto.JPG', JPG))).toMatchObject({ ok: true, tipo: 'imagem' });
  });

  it('rejeita extensão que não corresponde ao conteúdo', async () => {
    const r = await validarArquivo(arquivo('video.mp4', JPG));
    expect(r.ok).toBe(false);
  });

  it('rejeita arquivo disfarçado (GIF renomeado para .png)', async () => {
    expect((await validarArquivo(arquivo('a.png', GIF))).ok).toBe(false);
  });

  it('rejeita imagem acima de 10 MB', async () => {
    const r = await validarArquivo(arquivo('g.png', PNG, 10 * 1024 * 1024 + 1));
    expect(r).toMatchObject({ ok: false });
    expect(r.erro).toMatch(/grande/);
  });

  it('aceita vídeo de 50 MB', async () => {
    expect((await validarArquivo(arquivo('v.webm', WEBM, 50 * 1024 * 1024))).ok).toBe(true);
  });
});

describe('formatarBytes', () => {
  it('formata', () => {
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(2048)).toBe('2 KB');
    expect(formatarBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatarBytes(250 * 1024 * 1024)).toBe('250 MB');
  });
});
