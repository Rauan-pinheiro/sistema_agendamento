import { useLayoutEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { variaveisDestaque } from '../utils/cor';

/**
 * Aplica a cor da empresa no <html> (vale também para modais em portal) e a recalcula
 * a cada troca de tema. Ao desmontar, volta ao padrão de styles/tokens.css.
 */
export function useCorEmpresa(hex: string | null | undefined) {
  const { theme } = useTheme();
  useLayoutEffect(() => {
    if (!hex) return;
    const raiz = document.documentElement;
    const vars = variaveisDestaque(hex, theme);
    for (const [k, v] of Object.entries(vars)) raiz.style.setProperty(k, v);
    return () => { for (const k of Object.keys(vars)) raiz.style.removeProperty(k); };
  }, [hex, theme]);
}
