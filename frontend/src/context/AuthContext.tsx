import { createContext, useContext, useState, type ReactNode } from 'react';
import { login as apiLogin, registro as apiRegistro } from '../api/auth';
import { getMinhaEmpresa } from '../api/empresa';
import type { Empresa, RegistroPayload } from '../types';

interface AuthState {
  access: string | null;
  empresa: Empresa | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  registrar: (payload: RegistroPayload) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function parseEmpresa(raw: string | null): Empresa | null {
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  try {
    const parsed = JSON.parse(raw);
    // Garante que o objeto tem os campos mínimos esperados
    if (parsed && typeof parsed.slug === 'string') return parsed as Empresa;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const access = localStorage.getItem('access');
    const empresa = parseEmpresa(localStorage.getItem('empresa'));
    return { access, empresa };
  });

  async function login(username: string, password: string) {
    const tokens = await apiLogin(username, password);
    localStorage.setItem('access', tokens.access);
    localStorage.setItem('refresh', tokens.refresh);
    const empresa = await getMinhaEmpresa();
    localStorage.setItem('empresa', JSON.stringify(empresa));
    setState({ access: tokens.access, empresa });
  }

  async function registrar(payload: RegistroPayload) {
    const result = await apiRegistro(payload);
    localStorage.setItem('access', result.access);
    localStorage.setItem('refresh', result.refresh);
    localStorage.setItem('empresa', JSON.stringify(result.empresa));
    setState({ access: result.access, empresa: result.empresa });
  }

  function logout() {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('empresa');
    setState({ access: null, empresa: null });
  }

  return (
    <AuthContext.Provider
      value={{ ...state, login, registrar, logout, isAuthenticated: !!state.access }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
