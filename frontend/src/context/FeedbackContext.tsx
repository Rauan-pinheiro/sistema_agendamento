import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Modal } from '../components/Modal';

type TipoToast = 'sucesso' | 'erro' | 'info';

interface Toast {
  id: number;
  texto: string;
  tipo: TipoToast;
}

interface PedidoConfirmacao {
  titulo: string;
  mensagem?: string;
  confirmar?: string;   // texto do botão de confirmação (ação explícita: "Excluir serviço")
  cancelar?: string;
  perigo?: boolean;
}

interface FeedbackContextType {
  toast: (texto: string, tipo?: TipoToast) => void;
  /** Substitui window.confirm: resolve true se a pessoa confirmar. */
  confirmar: (pedido: PedidoConfirmacao) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextType | null>(null);
const DURACAO_MS = 4500;
const ICONE = { sucesso: CheckCircle2, erro: AlertCircle, info: Info };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const proximoId = useRef(1);

  const fechar = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);

  const toast = useCallback((texto: string, tipo: TipoToast = 'sucesso') => {
    const id = proximoId.current++;
    setToasts((l) => [...l.slice(-2), { id, texto, tipo }]);
    window.setTimeout(() => fechar(id), tipo === 'erro' ? DURACAO_MS * 1.6 : DURACAO_MS);
  }, [fechar]);

  const confirmar = useCallback((p: PedidoConfirmacao) => new Promise<boolean>((res) => {
    resolver.current = res;
    setPedido(p);
  }), []);

  function responder(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirmar }}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => {
            const Icone = ICONE[t.tipo];
            return (
              <div key={t.id} className={`toast toast--${t.tipo}`} role={t.tipo === 'erro' ? 'alert' : 'status'}>
                <Icone size={20} className="toast-icone" aria-hidden />
                <span className="toast-texto">{t.texto}</span>
                <button type="button" className="btn-icon" onClick={() => fechar(t.id)} aria-label="Fechar aviso">
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
      <Modal
        open={!!pedido}
        onClose={() => responder(false)}
        title={pedido?.titulo ?? ''}
        footer={pedido && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => responder(false)}>
              {pedido.cancelar ?? 'Voltar'}
            </button>
            <button
              type="button"
              className={`btn ${pedido.perigo ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => responder(true)}
            >
              {pedido.confirmar ?? 'Confirmar'}
            </button>
          </>
        )}
      >
        {pedido?.mensagem && <p className="confirmar-texto">{pedido.mensagem}</p>}
      </Modal>
    </FeedbackContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider');
  return ctx;
}
