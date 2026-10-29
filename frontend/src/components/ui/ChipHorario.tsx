import type { ButtonHTMLAttributes } from 'react';

interface ChipHorarioProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  hora: string;
  selecionado?: boolean;
}

/** Botão de horário. Ocupado = desabilitado e anunciado como "ocupado". */
export function ChipHorario({ hora, selecionado = false, disabled, className = '', ...props }: ChipHorarioProps) {
  return (
    <button
      type="button"
      className={`chip-horario ${className}`.trim()}
      aria-pressed={selecionado}
      aria-label={disabled ? `${hora}, ocupado` : hora}
      disabled={disabled}
      {...props}
    >
      {hora}
    </button>
  );
}
