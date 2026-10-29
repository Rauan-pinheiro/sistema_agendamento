import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  dica?: ReactNode;
  erro?: string;
}

/** Rótulo + campo + dica ou erro, já ligados por id e aria-describedby. */
export function Campo({ rotulo, dica, erro, id, className = '', ...props }: CampoProps) {
  const auto = useId();
  const campoId = id ?? auto;
  const descId = `${campoId}-desc`;
  return (
    <div className="campo-grupo">
      <label htmlFor={campoId}>{rotulo}</label>
      <input
        id={campoId}
        className={`campo ${className}`.trim()}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro || dica ? descId : undefined}
        {...props}
      />
      {erro
        ? <span id={descId} className="form-error">{erro}</span>
        : dica && <span id={descId} className="form-hint">{dica}</span>}
    </div>
  );
}
