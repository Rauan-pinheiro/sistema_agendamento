import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** No celular, abre como "bottom sheet" (encostado embaixo, ao alcance do polegar). */
  sheet?: boolean;
}

/**
 * Renderizado via portal no <body>: funciona mesmo quando aberto de dentro de
 * cards com overflow/transform. Fecha com Esc e devolve o foco ao sair.
 */
export function Modal({ open, onClose, title, children, footer, wide, sheet }: ModalProps) {
  const tituloId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      anterior?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={`modal-backdrop${sheet ? ' modal-backdrop--sheet' : ''}`} onClick={onClose}>
      <div
        ref={ref}
        className={`modal${sheet ? ' modal--sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        style={wide ? { maxWidth: 560 } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={tituloId}>{title}</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
