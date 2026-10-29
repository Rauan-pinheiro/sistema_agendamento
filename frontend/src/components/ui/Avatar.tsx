import type { CSSProperties } from 'react';
import { iniciais } from '../../utils/cor';

interface AvatarProps {
  nome: string;
  foto?: string | null;
  tamanho?: number;
  /** Cinza em vez da cor da empresa (ex.: "Qualquer profissional"). */
  neutro?: boolean;
  className?: string;
}

/** Foto redonda ou, sem foto, as iniciais sobre o tom suave da cor da empresa. Decorativo. */
export function Avatar({ nome, foto, tamanho = 32, neutro, className = '' }: AvatarProps) {
  return (
    <span
      className={`avatar${neutro ? ' avatar--neutro' : ''} ${className}`.trim()}
      style={{ '--tam': `${tamanho}px` } as CSSProperties}
      aria-hidden
    >
      {foto
        ? <img src={foto} alt="" width={tamanho} height={tamanho} loading="lazy" decoding="async" />
        : iniciais(nome)}
    </span>
  );
}
