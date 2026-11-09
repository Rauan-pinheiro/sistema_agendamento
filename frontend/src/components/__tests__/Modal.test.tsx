// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal';

/** Como as páginas usam o Modal: onClose inline (nova função a cada render). */
function FormularioNoModal() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  return (
    <>
      <button onClick={() => setAberto(true)}>Novo</button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Novo serviço">
        <label htmlFor="nome">Nome</label>
        <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('mantém o foco no campo enquanto a pessoa digita (onClose inline)', async () => {
    const user = userEvent.setup();
    render(<FormularioNoModal />);
    await user.click(screen.getByRole('button', { name: 'Novo' }));
    const campo = screen.getByLabelText('Nome');
    expect(campo).toHaveFocus(); // autoFocus respeitado
    await user.keyboard('Corte masculino');
    expect(campo).toHaveValue('Corte masculino');
    expect(campo).toHaveFocus();
  });

  it('fecha com Esc usando o onClose mais recente e devolve o foco a quem abriu', async () => {
    const user = userEvent.setup();
    render(<FormularioNoModal />);
    const abrir = screen.getByRole('button', { name: 'Novo' });
    await user.click(abrir);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it('chama o onClose atual mesmo depois de re-renders', async () => {
    const user = userEvent.setup();
    const primeiro = vi.fn();
    const segundo = vi.fn();
    const { rerender } = render(<Modal open onClose={primeiro} title="T">x</Modal>);
    rerender(<Modal open onClose={segundo} title="T">x</Modal>);
    await user.keyboard('{Escape}');
    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
  });
});
