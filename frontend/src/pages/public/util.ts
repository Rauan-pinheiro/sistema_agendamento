import type { ServicoPublico } from '../../types';

export const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/** Data local YYYY-MM-DD (toISOString usa UTC e erraria o dia à noite). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function deIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: valor % 1 ? 2 : 0 });
}
export function fmtDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}
export function labelDia(iso: string): string {
  const d = deIso(iso);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}
export function turno(hora: string): 'Manhã' | 'Tarde' | 'Noite' {
  const h = Number(hora.slice(0, 2));
  return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
}
/** Primeira foto (ou pôster de vídeo) da vitrine do serviço. */
export function fotoDoServico(s: ServicoPublico): string | null {
  return s.midias.find((m) => m.tipo !== 'youtube' && m.thumb_url)?.thumb_url ?? null;
}
