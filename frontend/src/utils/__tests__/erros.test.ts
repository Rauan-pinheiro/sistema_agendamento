import { describe, expect, it } from 'vitest';
import { mensagemDeErro } from '../erros';

const resposta = (status: number, data?: unknown) => ({ isAxiosError: true, message: `Request failed with status code ${status}`, response: { status, data } });

describe('mensagemDeErro', () => {
  it('usa o campo "erro" da API', () => {
    expect(mensagemDeErro(resposta(400, { erro: 'Horário indisponível.' }))).toBe('Horário indisponível.');
  });

  it('usa o primeiro erro de validação de campo', () => {
    expect(mensagemDeErro(resposta(400, { email: ['Informe um e-mail válido.'] }))).toBe('Informe um e-mail válido.');
  });

  it('usa "detail" do DRF', () => {
    expect(mensagemDeErro(resposta(403, { detail: 'Sem permissão.' }))).toBe('Sem permissão.');
  });

  it('sem resposta do servidor vira mensagem de conexão, nunca "Network Error"', () => {
    const msg = mensagemDeErro({ isAxiosError: true, message: 'Network Error' });
    expect(msg).toMatch(/conex/i);
    expect(msg).not.toMatch(/network/i);
  });

  it('500 da API mostra o código para o suporte achar o erro nos logs', () => {
    const msg = mensagemDeErro(resposta(500, { erro: 'Tivemos um problema.', codigo: '5a9eadda9ea74ad7' }));
    expect(msg).toBe('O servidor teve um problema. Tente de novo em instantes. (código 5a9eadda9ea74ad7)');
  });

  it('500 sem corpo útil vira mensagem amigável', () => {
    const msg = mensagemDeErro(resposta(500, '<html>Server Error</html>'));
    expect(msg).toMatch(/servidor/i);
    expect(msg).not.toMatch(/status code/i);
  });

  it('429 explica o limite de tentativas', () => {
    expect(mensagemDeErro(resposta(429, { detail: 'Request was throttled.' }))).toMatch(/muitas tentativas/i);
  });

  it('Error comum mantém a própria mensagem', () => {
    expect(mensagemDeErro(new Error('Arquivo grande demais.'))).toBe('Arquivo grande demais.');
  });

  it('valor desconhecido usa o padrão', () => {
    expect(mensagemDeErro(null, 'Padrão.')).toBe('Padrão.');
  });
});
