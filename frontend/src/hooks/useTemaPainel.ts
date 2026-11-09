import { useLayoutEffect } from 'react';

export const CLASSE_TEMA_PAINEL = 'tema-painel';

/**
 * Liga a paleta 60-30-10 do painel (styles/tokens.css) enquanto a tela estiver montada.
 * A classe fica no <html> para alcançar modais, toasts e confirmações em portal.
 * public/tema-inicial.js já a aplica antes da primeira pintura nas rotas do painel.
 */
export function useTemaPainel() {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.add(CLASSE_TEMA_PAINEL);
    return () => raiz.classList.remove(CLASSE_TEMA_PAINEL);
  }, []);
}
