import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';
import { mensagemDeErro } from '../api/anexos';
import {
  adicionarYoutube, assinarMidiaServico, confirmarMidiaServico, listMidiasServico,
  removerMidiaServico, reordenarMidiasServico,
} from '../api/servicos';
import { extrairYoutubeId } from '../utils/youtube';
import { GaleriaMidia, type AdaptadorGaleria } from './GaleriaMidia';

const MAX_ARQUIVOS = 10;

/** Fotos, vídeos e links do YouTube exibidos ao cliente no "Ver mais" do serviço. */
export function VitrineServico({ servicoId }: { servicoId: number }) {
  const [recarregarEm, setRecarregarEm] = useState(0);
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const campoId = useId();

  const adaptador = useMemo<AdaptadorGaleria>(() => ({
    async carregar() {
      const midias = await listMidiasServico(servicoId);
      const arquivos = midias.filter((m) => m.tipo !== 'youtube').length;
      return {
        itens: midias.map((m) => ({ ...m, nome: m.nome_original })),
        maxArquivos: MAX_ARQUIVOS,
        resumoCota: `${arquivos}/${MAX_ARQUIVOS} arquivos`,
      };
    },
    assinar: (arquivo) => assinarMidiaServico(servicoId, arquivo),
    confirmar: (p) => confirmarMidiaServico(servicoId, p),
    remover: (id) => removerMidiaServico(servicoId, id),
    reordenar: (ids) => reordenarMidiasServico(servicoId, ids),
  }), [servicoId]);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    if (!extrairYoutubeId(link)) {
      setErro('Link inválido. Use youtube.com/watch?v=… ou youtu.be/…');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await adicionarYoutube(servicoId, link);
      setLink('');
      setRecarregarEm((n) => n + 1);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <GaleriaMidia
      titulo="Vitrine do serviço (Ver mais)"
      adaptador={adaptador}
      recarregarEm={recarregarEm}
      extra={
        <form className="vitrine-youtube" onSubmit={adicionar}>
          <label htmlFor={campoId} className="sr-only">Link do YouTube</label>
          <Link2 size={16} aria-hidden className="vitrine-youtube-icone" />
          <input
            id={campoId}
            type="text"
            inputMode="url"
            placeholder="Cole um link do YouTube"
            value={link}
            onChange={(e) => { setLink(e.target.value); setErro(''); }}
            aria-invalid={!!erro}
            aria-describedby={erro ? `${campoId}-erro` : undefined}
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!link || salvando}>
            {salvando ? 'Adicionando…' : 'Adicionar link'}
          </button>
          {erro && <p id={`${campoId}-erro`} className="form-error" role="alert">{erro}</p>}
        </form>
      }
    />
  );
}
