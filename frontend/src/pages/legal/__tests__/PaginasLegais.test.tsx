// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PrivacidadePage, TermosPage } from '../PaginasLegais';

const CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;

describe.each([['Termos', TermosPage], ['Privacidade', PrivacidadePage]])('%s', (_, Pagina) => {
  it('identifica o responsável como pessoa física, sem CPF, CNPJ nem marcadores', () => {
    const { container } = render(<MemoryRouter><Pagina /></MemoryRouter>);
    const texto = container.textContent ?? '';
    expect(texto).toContain('Rauan Pinheiro Lima, pessoa física');
    expect(texto).not.toMatch(CPF);
    expect(texto).not.toMatch(/CNPJ|razão social|\[/);
    const zap = screen.getAllByRole('link', { name: '(88) 98868-4207' });
    expect(zap[0]).toHaveAttribute('href', 'https://wa.me/5588988684207');
  });
});

it('Privacidade indica o WhatsApp como canal dos direitos da LGPD, com prazo de 15 dias', () => {
  const { container } = render(<MemoryRouter><PrivacidadePage /></MemoryRouter>);
  expect(container.textContent).toMatch(/O canal para esses pedidos é o WhatsApp.*resposta é dada em até 15 dias/s);
});
