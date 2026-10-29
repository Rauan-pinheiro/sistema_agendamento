import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MESES, deIso, isoLocal, labelDia } from './util';

/** Calendário do mês para escolher uma data fora da faixa de dias. */
export function CalendarPicker({ value, onChange, min }: { value: string; onChange: (d: string) => void; min: string }) {
  const base = value ? deIso(value) : new Date();
  const [ano, setAno] = useState(base.getFullYear());
  const [mes, setMes] = useState(base.getMonth());
  const minimo = deIso(min);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const primeiro = (new Date(ano, mes, 1).getDay() + 6) % 7; // segunda = 0
  const podeVoltar = new Date(ano, mes, 1) > new Date(minimo.getFullYear(), minimo.getMonth(), 1);

  function mudar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  return (
    <div className="calendar-picker">
      <div className="calendar-header">
        <button type="button" className="btn-icon" onClick={() => mudar(-1)} disabled={!podeVoltar} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
        <span className="calendar-month-label" aria-live="polite">{MESES[mes]} de {ano}</span>
        <button type="button" className="btn-icon" onClick={() => mudar(1)} aria-label="Próximo mês"><ChevronRight size={18} /></button>
      </div>
      <div className="calendar-weekdays" aria-hidden>
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <span key={d} className="calendar-weekday">{d}</span>)}
      </div>
      <div className="calendar-days">
        {Array.from({ length: primeiro }, (_, i) => <span key={`v${i}`} className="calendar-day calendar-day--empty" />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const iso = isoLocal(new Date(ano, mes, i + 1));
          return (
            <button
              key={iso}
              type="button"
              disabled={iso < min}
              aria-pressed={value === iso}
              aria-label={labelDia(iso)}
              onClick={() => onChange(iso)}
              className={`calendar-day${iso === min ? ' calendar-day--today' : ''}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
