import { describe, expect, it } from 'vitest';
import { CORES_SUGERIDAS, contraste, corLegivel, estiloDestaque, textoSobre } from '../cor';

describe('cor de destaque', () => {
  it('calcula contraste WCAG conhecido', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contraste('#165C50', '#FFFFFF')).toBeGreaterThan(7);
  });

  it('escolhe texto branco em cor escura e tinta em cor clara', () => {
    expect(textoSobre('#165C50')).toBe('#FFFFFF');
    expect(textoSobre('#FFD25E')).toBe('#17262A');
  });

  it('recusa cores sem texto legível e formatos inválidos (igual ao servidor)', () => {
    expect(corLegivel('#808080')).toBe(false);
    expect(corLegivel('#FFF')).toBe(false);
    expect(corLegivel('red')).toBe(false);
    expect(corLegivel('#7A2238')).toBe(true);
  });

  it('todas as sugestões são legíveis', () => {
    for (const c of CORES_SUGERIDAS) expect(corLegivel(c), c).toBe(true);
  });

  it('cai no pinho quando a cor é inválida', () => {
    expect(estiloDestaque('#808080')['--destaque']).toBe('#165C50');
    expect(estiloDestaque('#7A2238')).toEqual({ '--destaque': '#7A2238', '--sobre-destaque': '#FFFFFF', '--destaque-texto': '#7A2238' });
  });

  it('cor clara não vira texto ilegível no fundo claro: usa a tinta', () => {
    expect(estiloDestaque('#FFD25E')['--destaque-texto']).toBe('#17262A');
    for (const c of CORES_SUGERIDAS) expect(contraste(estiloDestaque(c)['--destaque-texto'], '#F6F7F4')).toBeGreaterThanOrEqual(4.5);
  });
});
