import { describe, expect, it } from 'vitest';
import { CORES_SUGERIDAS, NEUTROS, ajustar, contraste, corLegivel, iniciais, textoSobre, variaveisDestaque } from '../cor';

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

  it('ajustar escurece no fundo claro e clareia no escuro até o alvo', () => {
    expect(contraste(ajustar('#9FD8C8', '#FFFFFF', 4.5), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contraste(ajustar('#17262A', '#0F1013', 4.5), '#0F1013')).toBeGreaterThanOrEqual(4.5);
  });

  it('cai na cor padrão quando o formato é inválido', () => {
    expect(variaveisDestaque('red', 'light')['--destaque']).toBe('#165C50');
    expect(variaveisDestaque(undefined, 'light')['--destaque']).toBe('#165C50');
  });

  it('mantém a cor original quando ela já tem contraste', () => {
    expect(variaveisDestaque('#7A2238', 'light')).toMatchObject({ '--destaque': '#7A2238', '--sobre-destaque': '#FFFFFF' });
  });

  // Inclui cores médias e extremas que a pessoa poderia ter salvo antes da validação
  const AMOSTRAS = [...CORES_SUGERIDAS, '#808080', '#FFFFFF', '#000000', '#FF0000', '#00B3FF'];
  for (const tema of ['light', 'dark'] as const) {
    it(`garante AA para qualquer cor no tema ${tema}`, () => {
      const { bg, surface } = NEUTROS[tema];
      for (const c of AMOSTRAS) {
        const v = variaveisDestaque(c, tema);
        expect(contraste(v['--destaque'], surface), `${c} preenchimento`).toBeGreaterThanOrEqual(3);
        expect(contraste(v['--destaque'], v['--sobre-destaque']), `${c} texto sobre`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v['--destaque-texto'], bg), `${c} como texto`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v['--destaque-texto'], v['--destaque-suave']), `${c} texto no suave`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v['--destaque-texto'], surface), `${c} texto na superfície`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v['--destaque-profundo'], v['--sobre-destaque']), `${c} capa sem foto`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('gera iniciais para logo e avatar sem foto', () => {
    expect(iniciais('Studio Lume')).toBe('SL');
    expect(iniciais('Barbearia Canto do Corte')).toBe('BC');
    expect(iniciais('Zé')).toBe('Z');
  });
});
