import type { CSSProperties } from 'react';

interface SkeletonProps {
  largura?: CSSProperties['width'];
  altura?: CSSProperties['height'];
  redondo?: boolean;
  className?: string;
}

/** Bloco de "carregando". Fica fora da árvore de acessibilidade; anuncie o carregamento no contêiner. */
export function Skeleton({ largura = '100%', altura = 16, redondo, className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{ width: largura, height: altura, borderRadius: redondo ? '50%' : undefined }}
      aria-hidden
    />
  );
}
