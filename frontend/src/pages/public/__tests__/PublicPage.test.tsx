// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgendamentoPublico, getHorariosDisponiveis, getPaginaPublica } from '../../../api/public';
import type { PaginaPublica, ProfissionalPublico } from '../../../types';
import { ThemeProvider } from '../../../context/ThemeContext';
import { PublicPage } from '../PublicPage';

vi.mock('../../../api/public', () => ({
  getPaginaPublica: vi.fn(),
  getHorariosDisponiveis: vi.fn(),
  createAgendamentoPublico: vi.fn(),
}));

const SLOT = '2030-01-02T09:00:00-03:00';

function pagina(profissionais: ProfissionalPublico[] = []): PaginaPublica {
  return {
    empresa: { id: 1, nome_fantasia: 'Barbearia Teste', slug: 'teste', whatsapp_contato: '85999990000', cor_destaque: '' },
    servicos: [
      { id: 1, nome: 'Corte', descricao: '', duracao_min: 30, preco: '35.00', midias: [] },
      { id: 2, nome: 'Barba', descricao: '', duracao_min: 20, preco: '25.00', midias: [] },
    ],
    profissionais,
  };
}

function renderizar() {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/teste']}>
        <Routes><Route path="/:slug" element={<PublicPage />} /></Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

const barra = () => screen.getByRole('region', { name: 'Resumo do agendamento' });

/** Escolhe serviço(s), amanhã e o primeiro horário livre. */
async function ate_o_formulario(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Escolher Corte' }));
  const dias = within(screen.getByRole('group', { name: 'Próximos dias' })).getAllByRole('button');
  await user.click(dias[1]);
  await user.click(await screen.findByRole('button', { name: '09:00' }));
}

describe('PublicPage: carrinho de serviços', () => {
  beforeEach(() => {
    vi.mocked(getPaginaPublica).mockResolvedValue(pagina());
    vi.mocked(getHorariosDisponiveis).mockResolvedValue({ data: '2030-01-02', slots: [] });
  });

  it('soma preço e duração dos serviços escolhidos e atualiza ao remover', async () => {
    const user = userEvent.setup();
    renderizar();
    expect(screen.queryByRole('region', { name: 'Resumo do agendamento' })).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Escolher Corte' }));
    await user.click(screen.getByRole('button', { name: 'Escolher Barba' }));
    expect(barra()).toHaveTextContent('Corte + Barba');
    expect(barra()).toHaveTextContent(/R\$\s*60/);
    expect(barra()).toHaveTextContent('50 min');
    expect(screen.getByRole('button', { name: 'Remover Corte' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Remover Corte' }));
    expect(barra()).toHaveTextContent(/R\$\s*25/);
    expect(barra()).not.toHaveTextContent('Corte');

    await user.click(screen.getByRole('button', { name: 'Remover Barba' }));
    expect(screen.queryByRole('region', { name: 'Resumo do agendamento' })).toBeNull();
  });

  it('com vários profissionais, exige escolher um antes da data', async () => {
    vi.mocked(getPaginaPublica).mockResolvedValue(pagina([
      { id: 7, nome: 'Ana Souza', especialidade: '' }, { id: 8, nome: 'Bruno', especialidade: '' },
    ]));
    const user = userEvent.setup();
    renderizar();
    await user.click(await screen.findByRole('button', { name: 'Escolher Corte' }));

    expect(within(barra()).getByRole('button', { name: 'Escolha o profissional' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Quando?' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Ana Souza/ }));
    expect(screen.getByRole('heading', { name: 'Quando?' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Próximos dias' })).getAllByRole('button')[1]);
    await waitFor(() => expect(getHorariosDisponiveis).toHaveBeenLastCalledWith('teste', expect.any(String), [1], 7));
  });
});

describe('PublicPage: formulário de agendamento', () => {
  beforeEach(() => {
    vi.mocked(createAgendamentoPublico).mockReset();
    vi.mocked(getHorariosDisponiveis).mockReset();
    vi.mocked(getPaginaPublica).mockResolvedValue(pagina());
    vi.mocked(getHorariosDisponiveis).mockResolvedValue({
      data: '2030-01-02',
      slots: [
        { hora: '09:00', datetime: SLOT, disponivel: true },
        { hora: '09:30', datetime: '2030-01-02T09:30:00-03:00', disponivel: false },
      ],
    });
  });

  it('mostra horários ocupados como desabilitados', async () => {
    const user = userEvent.setup();
    renderizar();
    await ate_o_formulario(user);
    expect(screen.getByRole('button', { name: '09:30, ocupado' })).toBeDisabled();
  });

  it('valida nome e WhatsApp antes de enviar', async () => {
    const user = userEvent.setup();
    renderizar();
    await ate_o_formulario(user);

    await user.type(screen.getByLabelText('Seu nome'), 'A');
    await user.type(screen.getByLabelText('WhatsApp'), '8599');
    await user.click(within(barra()).getByRole('button', { name: 'Agendar' }));

    expect(screen.getByText('Escreva seu nome (pelo menos 2 letras).')).toBeInTheDocument();
    expect(screen.getByText(/Use DDD \+ número/)).toBeInTheDocument();
    expect(screen.getByLabelText('Seu nome')).toHaveAttribute('aria-invalid', 'true');
    expect(createAgendamentoPublico).not.toHaveBeenCalled();
  });

  it('envia os dados normalizados e mostra a confirmação', async () => {
    vi.mocked(createAgendamentoPublico).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderizar();
    await ate_o_formulario(user);

    await user.type(screen.getByLabelText('Seu nome'), '  Maria Silva ');
    await user.type(screen.getByLabelText('WhatsApp'), '85988887777');
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('(85) 98888-7777');
    await user.click(within(barra()).getByRole('button', { name: 'Agendar' }));

    expect(createAgendamentoPublico).toHaveBeenCalledWith('teste', {
      servicos_ids: [1], profissional: null, data_hora: SLOT,
      nome_cliente: 'Maria Silva', whatsapp_cliente: '85988887777',
    });
    expect(await screen.findByRole('heading', { name: 'Pedido de agendamento enviado' })).toBeInTheDocument();
    expect(screen.getByText(/vai confirmar pelo WhatsApp \(85\) 98888-7777/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fazer outro agendamento' }));
    expect(screen.getByRole('button', { name: 'Escolher Corte' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('horário tomado por outra pessoa: mostra o erro e recarrega a grade', async () => {
    vi.mocked(createAgendamentoPublico).mockRejectedValue({
      response: { data: { data_hora: ['Este horário acabou de ser reservado.'] } },
    });
    const user = userEvent.setup();
    renderizar();
    await ate_o_formulario(user);
    const consultas = vi.mocked(getHorariosDisponiveis).mock.calls.length;

    await user.type(screen.getByLabelText('Seu nome'), 'Maria');
    await user.type(screen.getByLabelText('WhatsApp'), '85988887777');
    await user.click(within(barra()).getByRole('button', { name: 'Agendar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este horário acabou de ser reservado.');
    await waitFor(() => expect(vi.mocked(getHorariosDisponiveis).mock.calls.length).toBe(consultas + 1));
    expect(screen.getByRole('button', { name: '09:00' })).toHaveAttribute('aria-pressed', 'false');
  });
});
