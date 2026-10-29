import { useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { mensagemDeErro } from '../../utils/erros';

interface CampoImagemProps {
  rotulo: string;
  dica?: ReactNode;
  url?: string | null;
  /** "capa": 16:9; "redonda": logo e retrato. */
  formato?: 'capa' | 'redonda';
  /** Mostrado quando não há foto (ex.: o gradiente da cor ou as iniciais). */
  vazio?: ReactNode;
  onEnviar: (file: File, onProgresso: (pct: number) => void) => Promise<unknown>;
  onRemover?: () => Promise<unknown>;
}

/** Enviar, trocar ou remover uma foto, com prévia, progresso e erro anunciados. */
export function CampoImagem({ rotulo, dica, url, formato = 'redonda', vazio, onEnviar, onRemover }: CampoImagemProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState('');

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErro('');
    setProgresso(0);
    try {
      await onEnviar(file, setProgresso);
    } catch (err) {
      setErro(err instanceof Error && !('response' in err) ? err.message : mensagemDeErro(err, 'Não foi possível enviar a foto.'));
    } finally {
      setProgresso(null);
    }
  }

  async function remover() {
    if (!onRemover) return;
    setErro('');
    setProgresso(0);
    try { await onRemover(); } catch (err) { setErro(mensagemDeErro(err, 'Não foi possível remover a foto.')); } finally { setProgresso(null); }
  }

  const ocupado = progresso !== null;
  return (
    <div className={`campo-imagem campo-imagem--${formato}`}>
      <div className="campo-imagem-previa" aria-hidden>
        {url ? <img src={url} alt="" /> : vazio}
        {ocupado && <span className="campo-imagem-progresso"><span className="btn-spinner" />{progresso ? `${progresso}%` : ''}</span>}
      </div>
      <div className="campo-imagem-info">
        <span className="form-label" id={`${id}-rot`}>{rotulo}</span>
        {dica && <span className="form-hint">{dica}</span>}
        <div className="campo-imagem-acoes">
          <input ref={input} id={id} type="file" tabIndex={-1} accept="image/jpeg,image/png,image/webp" className="sr-only"
            onChange={escolher} disabled={ocupado} aria-labelledby={`${id}-rot ${id}-btn`} />
          <button type="button" id={`${id}-btn`} className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={ocupado}>
            <ImagePlus size={15} aria-hidden /> {url ? 'Trocar foto' : 'Enviar foto'}
          </button>
          {url && onRemover && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={remover} disabled={ocupado} aria-label={`Remover ${rotulo.toLowerCase()}`}>
              <Trash2 size={15} aria-hidden /> Remover
            </button>
          )}
        </div>
        <span className="sr-only" role="status">{ocupado ? 'Enviando foto…' : ''}</span>
        {erro && <span className="form-error" role="alert">{erro}</span>}
      </div>
    </div>
  );
}
