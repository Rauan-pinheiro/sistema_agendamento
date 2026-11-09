import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  /** Superfície do design system (ex.: "sup-vitrine"): o portal fica fora da página. */
  superficie?: string;
}

/**
 * Renderizado via portal no <body>: funciona mesmo quando aberto de dentro de
 * cards com overflow/transform. Fecha com Esc e devolve o foco ao sair.
 */
export function Modal({ open, onClose, title, children, footer, wide, sheet, superficie }: ModalProps) {
  const tituloId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // As páginas passam onClose inline (função nova a cada render). Se ele fosse dependência
  // do efeito abaixo, cada tecla digitada no formulário re-renderizaria a página, o efeito
  // rodaria de novo e o foco iria para o botão de origem e depois para a caixa do modal:
  // o campo perdia o foco a cada letra. Guardamos o onClose mais recente numa ref.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Quem abriu o modal: lido antes do commit, porque o autoFocus de um campo do
  // formulário já move o foco para dentro do modal antes dos efeitos rodarem.
  const [origem, setOrigem] = useState<HTMLElement | null>(null);
  const [abertoAntes, setAbertoAntes] = useState(open);
  if (open !== abertoAntes) {
    setAbertoAntes(open);
    setOrigem(open ? (document.activeElement as HTMLElement | null) : null);
  }

  useEffect(() => {
    if (!open) return;
    const anterior = origem ?? (document.activeElement as HTMLElement | null);
    // Respeita autoFocus de um campo do formulário; senão, foca a própria caixa.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      anterior?.focus?.();
    };
  }, [open, origem]); // origem só muda junto com open: o efeito roda uma vez por abertura

  if (!open) return null;

  return createPortal(
    <div className={`modal-backdrop${sheet ? ' modal-backdrop--sheet' : ''}${superficie ? ` ${superficie}` : ''}`} onClick={onClose}>
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
