import type { HTMLAttributes, ReactNode } from 'react';

interface CartaoProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  titulo?: string;
  /** Link ou botão discreto à direita do título. */
  acao?: ReactNode;
  children: ReactNode;
}

/** Bloco com borda (painel) ou sombra (vitrine), com cabeçalho opcional. */
export function Cartao({ titulo, acao, children, className = '', ...props }: CartaoProps) {
  return (
    <section className={`bloco ${className}`.trim()} {...props}>
      {titulo && (
        <div className="bloco-cab">
          <h2>{titulo}</h2>
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}
