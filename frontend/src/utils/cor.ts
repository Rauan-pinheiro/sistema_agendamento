/**
 * Cor de destaque por empresa com contraste WCAG garantido nos temas claro e escuro.
 * corLegivel espelha a validação do servidor (serializers._validar_cor_destaque).
 */
const TINTA = '#17262A';
const HEX = /^#[0-9a-fA-F]{6}$/;
export const COR_PADRAO = '#165C50';

/** Fundo e superfície de cada tema (iguais a --bg e --surface em styles/tokens.css). */
export const NEUTROS = {
  light: { bg: '#F7F8FA', surface: '#FFFFFF' },
  dark: { bg: '#0F1013', surface: '#16181C' },
} as const;
export type TemaCor = keyof typeof NEUTROS;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const paraHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

export function luminancia(hex: string): number {
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Mistura `a` com `b` na proporção t (0 = a, 1 = b). */
export function misturar(a: string, b: string, t: number): string {
  const [ca, cb] = [rgb(a), rgb(b)];
  return paraHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

/** Escurece (fundo claro) ou clareia (fundo escuro) a cor até alcançar o contraste pedido. */
export function ajustar(cor: string, fundo: string, alvo: number): string {
  const rumo = luminancia(fundo) < 0.2 ? '#FFFFFF' : '#000000';
  for (let i = 0; i < 24 && contraste(cor, fundo) < alvo; i++) cor = misturar(cor, rumo, 0.08);
  return cor;
}

/** Texto (#FFFFFF ou tinta) com maior contraste sobre a cor informada. */
export function textoSobre(hex: string): string {
  return contraste(hex, '#FFFFFF') >= contraste(hex, TINTA) ? '#FFFFFF' : TINTA;
}

/** true se algum texto (branco ou tinta) alcança 4,5:1 sobre a cor. */
export function corLegivel(hex: string): boolean {
  if (!HEX.test(hex)) return false;
  return Math.max(contraste(hex, '#FFFFFF'), contraste(hex, TINTA)) >= 4.5;
}

/**
 * As quatro variáveis da cor da empresa para o tema:
 *  --destaque        preenchimento (botões, seleção): 3:1 contra a superfície e 4,5:1 para o texto sobre ela
 *  --sobre-destaque  texto sobre o preenchimento
 *  --destaque-suave  fundo de seleção
 *  --destaque-texto  cor como texto: 4,5:1 sobre o fundo e sobre o tom suave
 */
export function variaveisDestaque(hex: string | null | undefined, tema: TemaCor): Record<string, string> {
  const base = hex && HEX.test(hex) ? hex.toUpperCase() : COR_PADRAO;
  const { bg, surface } = NEUTROS[tema];
  const rumo = tema === 'dark' ? '#FFFFFF' : '#000000';
  let fill = ajustar(base, surface, 3);
  for (let i = 0; i < 24 && contraste(fill, textoSobre(fill)) < 4.5; i++) fill = misturar(fill, rumo, 0.08);
  const suave = misturar(fill, surface, tema === 'dark' ? 0.8 : 0.86);
  return {
    '--destaque': fill,
    '--sobre-destaque': textoSobre(fill),
    '--destaque-suave': suave,
    '--destaque-texto': ajustar(ajustar(base, bg, 4.5), suave, 4.5),
  };
}

/** Iniciais para logo e avatar sem foto ("Studio Lume" → "SL"). */
export function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2)
    .map((p) => p[0]).join('').toUpperCase() || nome.slice(0, 1).toUpperCase();
}

/** Sugestões já validadas para o seletor do painel. */
export const CORES_SUGERIDAS = ['#165C50', '#1F4E8C', '#7A2238', '#8A4B12', '#5B3A8C', '#17262A', '#FFD25E', '#9FD8C8'];
