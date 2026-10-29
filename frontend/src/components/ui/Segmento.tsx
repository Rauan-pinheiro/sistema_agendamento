interface SegmentoProps<T extends string> {
  rotulo: string;
  opcoes: ReadonlyArray<{ valor: T; texto: string }>;
  valor: T;
  onChange: (v: T) => void;
}

/** Controle segmentado (ex.: Dia/Semana). Botões com aria-pressed dentro de um grupo rotulado. */
export function Segmento<T extends string>({ rotulo, opcoes, valor, onChange }: SegmentoProps<T>) {
  return (
    <div className="segmento" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => onChange(o.valor)}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}
