/**
 * Extrai o ID (11 caracteres) de links do YouTube. Espelha a validação do
 * servidor (backend/agendamentos/youtube.py), que é a autoritativa.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS_LONGOS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com']);
const PREFIXOS = ['/shorts/', '/embed/', '/live/', '/v/'];

export function extrairYoutubeId(entrada: string): string | null {
  let texto = (entrada ?? '').trim();
  if (!texto || texto.length > 500) return null;
  if (!texto.includes('://')) texto = `https://${texto}`;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  let candidato: string | null = null;
  if (host === 'youtu.be') {
    candidato = url.pathname.replace(/^\//, '').split('/')[0];
  } else if (HOSTS_LONGOS.has(host)) {
    if (url.pathname === '/watch') {
      candidato = url.searchParams.get('v');
    } else {
      const prefixo = PREFIXOS.find((p) => url.pathname.startsWith(p));
      if (prefixo) candidato = url.pathname.slice(prefixo.length).split('/')[0];
    }
  }
  return candidato && ID.test(candidato) ? candidato : null;
}
