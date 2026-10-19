import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Tema = 'light' | 'dark';
export type PreferenciaTema = Tema | 'system';

interface ThemeContextType {
  /** Tema efetivamente em uso (resolve "system"). */
  theme: Tema;
  preferencia: PreferenciaTema;
  definirPreferencia: (p: PreferenciaTema) => void;
  /** Alterna para o tema oposto ao atual (vira escolha manual). */
  toggleTheme: () => void;
}

const CHAVE = 'tema';
const ThemeContext = createContext<ThemeContextType | null>(null);
const consultaEscuro = () => window.matchMedia?.('(prefers-color-scheme: dark)');

function lerPreferencia(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Segue o tema do sistema por padrão; o painel permite fixar claro ou escuro. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(lerPreferencia);
  const [sistemaEscuro, setSistemaEscuro] = useState(() => !!consultaEscuro()?.matches);

  useEffect(() => {
    const mq = consultaEscuro();
    if (!mq) return;
    const aoMudar = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  useEffect(() => {
    const raiz = document.documentElement;
    try {
      if (preferencia === 'system') {
        raiz.removeAttribute('data-theme');
        localStorage.removeItem(CHAVE);
      } else {
        raiz.setAttribute('data-theme', preferencia);
        localStorage.setItem(CHAVE, preferencia);
      }
    } catch { /* armazenamento indisponível: vale só nesta sessão */ }
  }, [preferencia]);

  const theme: Tema = preferencia === 'system' ? (sistemaEscuro ? 'dark' : 'light') : preferencia;
  const toggleTheme = useCallback(() => setPreferencia(theme === 'dark' ? 'light' : 'dark'), [theme]);

  return (
    <ThemeContext.Provider value={{ theme, preferencia, definirPreferencia: setPreferencia, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
