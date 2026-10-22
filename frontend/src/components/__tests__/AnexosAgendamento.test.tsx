// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmarAnexo, enviarArquivo, listAnexos, pedirAssinatura, removerAnexo } from '../../api/anexos';
import type { AnexosResposta } from '../../types';
import { validarArquivo } from '../../utils/midia';
import { AnexosAgendamento } from '../AnexosAgendamento';

vi.mock('../../api/anexos', () => ({
  listAnexos: vi.fn(),
  pedirAssinatura: vi.fn(),
  enviarArquivo: vi.fn(),
  confirmarAnexo: vi.fn(),
  removerAnexo: vi.fn(),
}));
vi.mock('../../utils/midia', async (original) => ({
  ...(await original<typeof import('../../utils/midia')>()),
  validarArquivo: vi.fn(),
  comprimirImagem: vi.fn(async (f: File) => f),
}));

function resposta(qtd: number, max = 15): AnexosResposta {
  return {
    anexos: Array.from({ length: qtd }, (_, i) => ({
      id: i + 1, tipo: 'imagem', url: `https://x/${i}.jpg`, thumb_url: `https://x/t${i}.jpg`,
      nome_original: `foto-${i + 1}.jpg`, formato: 'jpg', bytes: 1024, largura: 10, altura: 10,
    })),
    cota: { arquivos: qtd, max_arquivos: max, bytes: qtd * 1024, max_bytes: 250 * 1024 * 1024 },
  } as unknown as AnexosResposta;
}

const ASSINATURA = { public_id: 'pasta/abc', upload_url: 'https://up', campos: {}, max_bytes: 1, tipo: 'imagem' as const, nome: 'nova.jpg' };

function arquivo(nome = 'nova.jpg') {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], nome, { type: 'image/jpeg' });
}
const inputArquivos = () => document.querySelector<HTMLInputElement>('input[type=file][multiple]')!;

describe('AnexosAgendamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAnexos).mockResolvedValue(resposta(2));
    vi.mocked(validarArquivo).mockResolvedValue({ ok: true, mime: 'image/jpeg', tipo: 'imagem' });
    vi.mocked(pedirAssinatura).mockResolvedValue(ASSINATURA);
    vi.mocked(enviarArquivo).mockResolvedValue({ public_id: 'pasta/abc' } as never);
    vi.mocked(confirmarAnexo).mockResolvedValue({} as never);
    vi.mocked(removerAnexo).mockResolvedValue();
  });

  it('lista os anexos com a cota e informa o total', async () => {
    const onTotal = vi.fn();
    render(<AnexosAgendamento agendamentoId={9} onTotalChange={onTotal} />);
    expect(await screen.findByRole('button', { name: 'Abrir foto-1.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir foto-2.jpg' })).toBeInTheDocument();
    expect(screen.getByText(/^2\/15 · /)).toBeInTheDocument();
    expect(onTotal).toHaveBeenCalledWith(2);
    expect(listAnexos).toHaveBeenCalledWith(9);
  });

  it('envia um arquivo: assina, sobe direto ao armazenamento, confirma e recarrega', async () => {
    const user = userEvent.setup();
    render(<AnexosAgendamento agendamentoId={9} />);
    await screen.findByRole('button', { name: 'Abrir foto-1.jpg' });
    vi.mocked(listAnexos).mockResolvedValue(resposta(3));

    await user.upload(inputArquivos(), arquivo());

    await screen.findByRole('button', { name: 'Abrir foto-3.jpg' });
    expect(pedirAssinatura).toHaveBeenCalledWith(9, { nome: 'nova.jpg', mime: 'image/jpeg', tamanho: 3 }, undefined);
    expect(enviarArquivo).toHaveBeenCalledWith(expect.any(File), ASSINATURA, expect.any(Function));
    expect(confirmarAnexo).toHaveBeenCalledWith(9, {
      public_id: 'pasta/abc', tipo: 'imagem', nome: 'nova.jpg', substituir_id: undefined,
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('arquivo inválido mostra o erro e não pede assinatura', async () => {
    vi.mocked(validarArquivo).mockResolvedValue({ ok: false, erro: 'Formato não suportado.' });
    const user = userEvent.setup();
    render(<AnexosAgendamento agendamentoId={9} />);
    await screen.findByRole('button', { name: 'Abrir foto-1.jpg' });

    await user.upload(inputArquivos(), arquivo('doc.jpg'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Formato não suportado.');
    expect(pedirAssinatura).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('remove um anexo depois de confirmar', async () => {
    const user = userEvent.setup();
    render(<AnexosAgendamento agendamentoId={9} />);
    await user.click(await screen.findByRole('button', { name: 'Abrir foto-2.jpg' }));

    await user.click(screen.getByRole('button', { name: /Remover/ }));
    expect(removerAnexo).not.toHaveBeenCalled();
    vi.mocked(listAnexos).mockResolvedValue(resposta(1));
    await user.click(screen.getByRole('button', { name: 'Remover' }));

    expect(removerAnexo).toHaveBeenCalledWith(9, 2);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Abrir foto-2.jpg' })).toBeNull());
  });

  it('esconde o botão Adicionar quando a cota de arquivos está cheia', async () => {
    vi.mocked(listAnexos).mockResolvedValue(resposta(2, 2));
    render(<AnexosAgendamento agendamentoId={9} />);
    await screen.findByRole('button', { name: 'Abrir foto-1.jpg' });
    expect(screen.queryByRole('button', { name: 'Adicionar fotos ou vídeos' })).toBeNull();
  });
});
