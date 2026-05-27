import { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  function computeCoords() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 8, left: r.left + r.width / 2 });
  }

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVisible(false); };
    const onOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setVisible(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOut);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOut);
    };
  }, [visible]);

  return (
    <span
      ref={ref}
      className="tooltip-wrapper"
      onMouseEnter={() => { computeCoords(); setVisible(true); }}
      onMouseLeave={() => setVisible(false)}
      onClick={() => { computeCoords(); setVisible(v => !v); }}
      aria-describedby={visible ? id : undefined}
    >
      {children}
      {visible && createPortal(
        <span
          id={id}
          role="tooltip"
          className="tooltip-bubble"
          style={{ top: coords.top, left: coords.left }}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}
