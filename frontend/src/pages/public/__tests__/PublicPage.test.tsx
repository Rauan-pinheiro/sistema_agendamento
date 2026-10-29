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
  await user.click(await screen.findByRole('button', { name: 'Adicionar Corte' }));
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

    await user.click(await screen.findByRole('button', { name: 'Adicionar Corte' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar Barba' }));
    expect(barra()).toHaveTextContent('Corte + Barba');
    expect(barra()).toHaveTextContent(/R\$\s*60/);
    expect(barra()).toHaveTextContent('50 min');
    expect(screen.getByRole('button', { name: 'Adicionar Corte' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Adicionar Corte' }));
    expect(barra()).toHaveTextContent(/R\$\s*25/);
    expect(barra()).not.toHaveTextContent('Corte');

    await user.click(screen.getByRole('button', { name: 'Adicionar Barba' }));
    expect(screen.queryByRole('region', { name: 'Resumo do agendamento' })).toBeNull();
  });

  it('com vários profissionais, exige escolher um antes da data', async () => {
    vi.mocked(getPaginaPublica).mockResolvedValue(pagina([
      { id: 7, nome: 'Ana Souza', especialidade: '' }, { id: 8, nome: 'Bruno', especialidade: '' },
    ]));
    const user = userEvent.setup();
    renderizar();
    await user.click(await screen.findByRole('button', { name: 'Adicionar Corte' }));

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
    expect(screen.getByRole('button', { name: 'Adicionar Corte' })).toHaveAttribute('aria-pressed', 'false');
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

describe('PublicPage: vitrine com e sem fotos e estados da página', () => {
  const foto = (id: number) => ({
    id, tipo: 'imagem' as const, url: `https://img/${id}.webp`, thumb_url: `https://img/${id}-t.webp`, embed_url: null,
    youtube_id: '', largura: 800, altura: 800, duracao_seg: null, ordem: id,
  });

  it('sem nenhuma foto: capa em gradiente com iniciais e cartões compactos', async () => {
    vi.mocked(getPaginaPublica).mockResolvedValue(pagina());
    renderizar();
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Barbearia Teste' });
    const capa = titulo.closest('header')!;
    expect(capa).toHaveClass('capa--cor');
    expect(capa.querySelector('img')).toBeNull();
    expect(capa).toHaveTextContent('BT');
    expect(document.querySelector('.cartoes--compactos')).not.toBeNull();
    expect(document.querySelectorAll('.cartao-servico--compacto')).toHaveLength(2);
  });

  it('com fotos: capa em srcset com prioridade, logo, retratos da equipe e cartões com foto', async () => {
    const p = pagina([
      { id: 7, nome: 'Ana Souza', especialidade: 'Cortes', foto_url: 'https://img/ana.webp' },
      { id: 8, nome: 'Bruno Lima', especialidade: '', foto_url: null },
    ]);
    p.empresa.capa = { url: 'https://img/capa-1600.webp', srcset: 'https://img/capa-640.webp 640w, https://img/capa-1600.webp 1600w' };
    p.empresa.logo_url = 'https://img/logo.webp';
    p.servicos = p.servicos.map((s, i) => ({ ...s, midias: [foto(i + 1)] }));
    vi.mocked(getPaginaPublica).mockResolvedValue(p);
    const user = userEvent.setup();
    renderizar();
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Barbearia Teste' });
    const imgs = titulo.closest('header')!.querySelectorAll('img');
    expect(imgs[0]).toHaveAttribute('srcset', expect.stringContaining('640w'));
    expect(imgs[0]).toHaveAttribute('fetchpriority', 'high');
    expect(imgs[1]).toHaveAttribute('src', 'https://img/logo.webp');
    expect(document.querySelectorAll('.cartao-servico--foto img')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Adicionar Corte' }));
    const ana = screen.getByRole('button', { name: /Ana Souza/ });
    expect(ana.querySelector('img')).toHaveAttribute('src', 'https://img/ana.webp');
    expect(screen.getByRole('button', { name: /Bruno Lima/ })).toHaveTextContent('BL'); // sem foto: iniciais
  });

  it('empresa suspensa mostra aviso próprio, sem o formulário', async () => {
    vi.mocked(getPaginaPublica).mockRejectedValue({ response: { status: 410 } });
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Agendamento online indisponível' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Serviços' })).toBeNull();
  });

  it('link errado mostra "não encontrada"; falha de rede oferece tentar de novo', async () => {
    vi.mocked(getPaginaPublica).mockRejectedValueOnce({ response: { status: 404 } });
    const { unmount } = render(
      <ThemeProvider><MemoryRouter initialEntries={['/x']}><Routes><Route path="/:slug" element={<PublicPage />} /></Routes></MemoryRouter></ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    unmount();

    vi.mocked(getPaginaPublica).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(pagina());
    const user = userEvent.setup();
    renderizar();
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
  });

  it('sem serviços: orienta a falar pelo WhatsApp', async () => {
    vi.mocked(getPaginaPublica).mockResolvedValue({ ...pagina(), servicos: [] });
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Ainda sem serviços online' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\(85\) 99999-0000/ })).toHaveAttribute('href', 'https://wa.me/5585999990000');
  });
});
