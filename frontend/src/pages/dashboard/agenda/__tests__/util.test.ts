import { describe, expect, it } from 'vitest';
import { inicioSemana, tituloDia, tituloSemana } from '../util';

describe('títulos da agenda', () => {
  it('semana começa na segunda', () => {
    expect(inicioSemana(new Date(2026, 9, 29)).toDateString()).toBe(new Date(2026, 9, 26).toDateString());
    expect(inicioSemana(new Date(2026, 10, 1)).toDateString()).toBe(new Date(2026, 9, 26).toDateString()); // domingo
  });

  it('visão Dia mostra o dia; visão Semana mostra o intervalo, não o dia', () => {
    expect(tituloDia(new Date(2026, 9, 29))).toBe('Quinta, 29 de outubro');
    expect(tituloSemana(new Date(2026, 9, 26))).toBe('26 de outubro a 1º de novembro');
    expect(tituloSemana(new Date(2026, 10, 2))).toBe('2 a 8 de novembro');
    expect(tituloSemana(new Date(2026, 11, 28))).toBe('28 de dezembro de 2026 a 3 de janeiro de 2027');
  });
});
