import type { AgendamentoStatus } from '../types';

const LABELS: Record<AgendamentoStatus, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  arquivado: 'Arquivado',
};

interface BadgeProps {
  status: AgendamentoStatus;
}

export function Badge({ status }: BadgeProps) {
  return (
    <span className={`badge badge--${status}`}>
      {LABELS[status]}
    </span>
  );
}
