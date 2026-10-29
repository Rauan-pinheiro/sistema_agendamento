import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EstadoVazioProps {
  icone: LucideIcon;
  titulo: string;
  children?: ReactNode;
  /** Próximo passo (ex.: botão "Cadastrar serviço"). */
  acao?: ReactNode;
  nivel?: 2 | 3;
}

/** Vazio que orienta: diz o que falta e oferece o próximo passo. */
export function EstadoVazio({ icone: Icone, titulo, children, acao, nivel = 3 }: EstadoVazioProps) {
  const Titulo = nivel === 2 ? 'h2' : 'h3';
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden><Icone size={22} /></span>
      <Titulo>{titulo}</Titulo>
      {children && <p className="empty-hint">{children}</p>}
      {acao}
    </div>
  );
}
