/**
 * Cores de destaque por empresa: escolhe o texto legível (WCAG) sobre a cor.
 * Espelha a validação do servidor (serializers._validar_cor_destaque).
 */
const TINTA = '#17262A';
const FUNDO_CLARO = '#F6F7F4';
const HEX = /^#[0-9a-fA-F]{6}$/;

export function luminancia(hex: string): number {
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
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

/** Variáveis CSS da página pública para a cor da empresa (cai no pinho se inválida). */
export function estiloDestaque(hex: string | undefined): Record<string, string> {
  const cor = hex && corLegivel(hex) ? hex : '#165C50';
  // Como cor de texto (links, "Ver mais") a cor precisa de 4,5:1 sobre o fundo claro; senão, tinta.
  const comoTexto = contraste(cor, FUNDO_CLARO) >= 4.5 ? cor : TINTA;
  return { '--destaque': cor, '--sobre-destaque': textoSobre(cor), '--destaque-texto': comoTexto };
}

/** Sugestões já validadas para o seletor do painel. */
export const CORES_SUGERIDAS = ['#165C50', '#1F4E8C', '#7A2238', '#8A4B12', '#5B3A8C', '#17262A', '#FFD25E', '#9FD8C8'];
