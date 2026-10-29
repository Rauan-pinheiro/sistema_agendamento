import type { ReactNode } from 'react';

export type TomSelo = 'ok' | 'aviso' | 'perigo' | 'neutro' | 'destaque';

/** Etiqueta curta de estado (Confirmado, Aguardando, agora). */
export function Selo({ tom = 'neutro', children }: { tom?: TomSelo; children: ReactNode }) {
  return <span className={`selo selo--${tom}`}>{children}</span>;
}
