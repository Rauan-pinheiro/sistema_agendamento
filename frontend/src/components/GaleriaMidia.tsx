import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ImagePlus, Play, RefreshCw, Trash2, X,
} from 'lucide-react';
import { enviarParaCloudinary, mensagemDeErro } from '../api/anexos';
import type { AssinaturaUpload } from '../types';
import { ACCEPT_MIDIA, comprimirImagem, formatarBytes, validarArquivo, type TipoMidia } from '../utils/midia';
import { Modal } from './Modal';
import { YoutubeFacade } from './YoutubeFacade';

export interface ItemGaleria {
  id: number;
  tipo: 'imagem' | 'video' | 'youtube';
  url: string | null;
  thumb_url: string | null;
  youtube_id?: string;
  nome?: string;
  formato?: string;
  bytes?: number;
  largura?: number | null;
  altura?: number | null;
}

export interface DadosGaleria {
  itens: ItemGaleria[];
  /** Ex.: "3/15 · 12 MB de 250 MB" */
  resumoCota?: string;
  /** Limite de arquivos (não conta YouTube) */
  maxArquivos?: number;
}

/** Operações de API que a galeria usa — anexos de agendamento ou vitrine de serviço. */
export interface AdaptadorGaleria {
  carregar: () => Promise<DadosGaleria>;
  assinar: (arquivo: { nome: string; mime: string; tamanho: number }, substituirId?: number) => Promise<AssinaturaUpload>;
  confirmar: (p: { public_id: string; tipo: TipoMidia; nome: string; substituir_id?: number }) => Promise<unknown>;
  remover: (id: number) => Promise<void>;
  /** Se definido, o lightbox oferece mover para a esquerda/direita */
  reordenar?: (ids: number[]) => Promise<void>;
  permiteSubstituir?: boolean;
}

type EstadoEnvio = 'na-fila' | 'preparando' | 'enviando' | 'confirmando' | 'erro';

interface Envio {
  chave: string;
  nome: string;
  estado: EstadoEnvio;
  progresso: number;
  erro?: string;
  arquivo: File;
  substituirId?: number;
}

const ROTULO: Record<EstadoEnvio, string> = {
  'na-fila': 'Na fila',
  preparando: 'Preparando…',
  enviando: 'Enviando',
  confirmando: 'Finalizando…',
  erro: 'Erro',
};

const NOME_TIPO = { imagem: 'foto', video: 'vídeo', youtube: 'vídeo do YouTube' } as const;

/**
 * Galeria com upload direto ao Cloudinary (URL assinada), um arquivo por vez,
 * barra de progresso, arrastar e soltar, lightbox, substituir e remover.
 * `recarregarEm` força nova leitura (ex.: depois de adicionar um link do YouTube).
 */
export function GaleriaMidia({ titulo, adaptador, extra, recarregarEm = 0, onTotalChange }: {
  titulo: string;
  adaptador: AdaptadorGaleria;
  extra?: ReactNode;
  recarregarEm?: number;
  onTotalChange?: (total: number) => void;
}) {
  const [dados, setDados] = useState<DadosGaleria>({ itens: [] });
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [aberto, setAberto] = useState<number | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const substituirRef = useRef<HTMLInputElement>(null);
  const processando = useRef(false);
  const fila = useRef<Envio[]>([]);
  const adaptadorRef = useRef(adaptador);
  useEffect(() => { adaptadorRef.current = adaptador; }, [adaptador]);

  const aplicar = useCallback((d: DadosGaleria) => {
    setDados(d);
    setErroLista('');
    onTotalChange?.(d.itens.length);
  }, [onTotalChange]);

  const recarregar = useCallback(async () => {
    try {
      aplicar(await adaptadorRef.current.carregar());
    } catch (err) {
      setErroLista(mensagemDeErro(err, 'Não foi possível carregar as mídias.'));
    }
  }, [aplicar]);

  useEffect(() => {
    let vivo = true;
    adaptadorRef.current.carregar()
      .then((d) => { if (vivo) aplicar(d); })
      .catch((err) => { if (vivo) setErroLista(mensagemDeErro(err, 'Não foi possível carregar as mídias.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [aplicar, recarregarEm]);

  const atualizar = (chave: string, mudanca: Partial<Envio>) =>
    setEnvios((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...mudanca } : e)));

  async function enviarUm(envio: Envio) {
    const { chave } = envio;
    try {
      atualizar(chave, { estado: 'preparando' });
      const validacao = await validarArquivo(envio.arquivo);
      if (!validacao.ok || !validacao.mime) throw new Error(validacao.erro);
      const arquivo = validacao.tipo === 'imagem' ? await comprimirImagem(envio.arquivo) : envio.arquivo;
      const assinatura = await adaptadorRef.current.assinar(
        { nome: arquivo.name, mime: arquivo.type || validacao.mime, tamanho: arquivo.size },
        envio.substituirId,
      );
      atualizar(chave, { estado: 'enviando', progresso: 0 });
      const { public_id } = await enviarParaCloudinary(arquivo, assinatura, (p) => atualizar(chave, { progresso: p }));
      atualizar(chave, { estado: 'confirmando', progresso: 100 });
      await adaptadorRef.current.confirmar({
        public_id, tipo: assinatura.tipo, nome: assinatura.nome, substituir_id: envio.substituirId,
      });
      setEnvios((lista) => lista.filter((e) => e.chave !== chave));
      await recarregar();
    } catch (err) {
      atualizar(chave, { estado: 'erro', erro: mensagemDeErro(err, 'Falha no envio.') });
    }
  }

  /** Fila sequencial: um arquivo por vez evita disputa de banda em conexões móveis. */
  async function processarFila() {
    if (processando.current) return;
    processando.current = true;
    try {
      while (fila.current.length) await enviarUm(fila.current.shift()!);
    } finally {
      processando.current = false;
    }
  }

  function enfileirar(arquivos: FileList | File[], substituirId?: number) {
    const novos: Envio[] = Array.from(arquivos).map((arquivo, i) => ({
      chave: `${Date.now()}-${i}-${arquivo.name}`,
      nome: arquivo.name,
      estado: 'na-fila',
      progresso: 0,
      arquivo,
      substituirId,
    }));
    setEnvios((l) => [...l, ...novos]);
    fila.current.push(...novos);
    processarFila();
  }

  async function remover(item: ItemGaleria) {
    try {
      await adaptador.remover(item.id);
      setAberto(null);
      setConfirmarRemocao(false);
      await recarregar();
    } catch (err) {
      setErroLista(mensagemDeErro(err));
    }
  }

  async function mover(delta: -1 | 1) {
    if (aberto === null || !adaptador.reordenar) return;
    const ids = dados.itens.map((i) => i.id);
    const destino = aberto + delta;
    [ids[aberto], ids[destino]] = [ids[destino], ids[aberto]];
    try {
      await adaptador.reordenar(ids);
      await recarregar();
      setAberto(destino);
    } catch (err) {
      setErroLista(mensagemDeErro(err));
    }
  }

  function aoSoltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files.length) enfileirar(e.dataTransfer.files);
  }

  const { itens } = dados;
  const atual = aberto !== null ? itens[aberto] : null;
  const arquivos = itens.filter((i) => i.tipo !== 'youtube').length;
  const pendentes = envios.filter((e) => e.estado !== 'erro').length;
  const lotado = dados.maxArquivos !== undefined && arquivos + pendentes >= dados.maxArquivos;
  const tituloItem = (i: ItemGaleria, n: number) => i.nome || `${NOME_TIPO[i.tipo]} ${n + 1}`;

  return (
    <div className="anexos" onClick={(e) => e.stopPropagation()}>
      <div className="anexos-header">
        <p className="expanded-section-label">{titulo}</p>
        {dados.resumoCota && <span className="anexos-cota">{dados.resumoCota}</span>}
      </div>

      {erroLista && <p className="form-error" role="alert">{erroLista}</p>}

      <div
        className={`anexos-grid${arrastando ? ' anexos-grid--drop' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
      >
        {carregando && [0, 1, 2].map((i) => <div key={i} className="anexo-thumb skeleton" />)}

        {itens.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="anexo-thumb"
            onClick={() => { setAberto(i); setConfirmarRemocao(false); }}
            aria-label={`Abrir ${tituloItem(item, i)}`}
          >
            {item.thumb_url
              ? <img src={item.thumb_url} alt="" loading="lazy" decoding="async" />
              : <span className="anexo-thumb-vazio">{item.formato?.toUpperCase()}</span>}
            {item.tipo !== 'imagem' && (
              <span className={`anexo-play${item.tipo === 'youtube' ? ' anexo-play--yt' : ''}`} aria-hidden>
                <Play size={14} fill="currentColor" />
              </span>
            )}
          </button>
        ))}

        {envios.map((e) => (
          <div key={e.chave} className={`anexo-thumb anexo-envio anexo-envio--${e.estado}`} title={e.erro || e.nome}>
            <span className="anexo-envio-nome">{e.nome}</span>
            {e.estado === 'erro' ? (
              <>
                <span className="anexo-envio-erro" role="alert">{e.erro}</span>
                <button
                  type="button"
                  className="btn-icon anexo-envio-fechar"
                  aria-label="Descartar"
                  onClick={() => setEnvios((l) => l.filter((x) => x.chave !== e.chave))}
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="anexo-envio-estado">
                  {ROTULO[e.estado]}{e.estado === 'enviando' ? ` ${e.progresso}%` : ''}
                </span>
                <div
                  className="anexo-progresso"
                  role="progressbar"
                  aria-label={`Envio de ${e.nome}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={e.progresso}
                >
                  <div style={{ width: `${e.progresso}%` }} />
                </div>
              </>
            )}
          </div>
        ))}

        {!lotado && (
          <button
            type="button"
            className="anexo-thumb anexo-adicionar"
            onClick={() => inputRef.current?.click()}
            aria-label="Adicionar fotos ou vídeos"
          >
            <ImagePlus size={20} />
            <span>Adicionar</span>
          </button>
        )}
      </div>
      <p className="anexos-dica">JPG, PNG, WEBP (até 10 MB) ou MP4, WEBM (até 100 MB). Arraste arquivos para cá.</p>
      {extra}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MIDIA}
        multiple
        hidden
        onChange={(e) => { if (e.target.files) enfileirar(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={substituirRef}
        type="file"
        accept={ACCEPT_MIDIA}
        hidden
        onChange={(e) => {
          if (e.target.files?.[0] && atual) {
            enfileirar([e.target.files[0]], atual.id);
            setAberto(null);
          }
          e.target.value = '';
        }}
      />

      <Modal
        open={!!atual}
        onClose={() => setAberto(null)}
        title={atual ? tituloItem(atual, aberto!) : ''}
        wide
        footer={atual && (
          confirmarRemocao ? (
            <>
              <span className="agendamento-delete-confirm-text">Remover?</span>
              <button className="btn btn-danger btn-sm" onClick={() => remover(atual)}>Remover</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmarRemocao(false)}>Cancelar</button>
            </>
          ) : (
            <>
              {adaptador.reordenar && itens.length > 1 && (
                <>
                  <button className="btn-icon" disabled={aberto === 0} onClick={() => mover(-1)} aria-label="Mover para a esquerda">
                    <ArrowLeft size={16} />
                  </button>
                  <button className="btn-icon" disabled={aberto === itens.length - 1} onClick={() => mover(1)} aria-label="Mover para a direita">
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
              {adaptador.permiteSubstituir && atual.tipo !== 'youtube' && (
                <button className="btn btn-secondary btn-sm" onClick={() => substituirRef.current?.click()}>
                  <RefreshCw size={14} /> Substituir
                </button>
              )}
              <button className="btn btn-ghost btn-sm agendamento-delete-btn" onClick={() => setConfirmarRemocao(true)}>
                <Trash2 size={14} /> Remover
              </button>
            </>
          )
        )}
      >
        {atual && (
          <div
            className="anexo-lightbox"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' && aberto! < itens.length - 1) setAberto(aberto! + 1);
              if (e.key === 'ArrowLeft' && aberto! > 0) setAberto(aberto! - 1);
            }}
          >
            {atual.tipo === 'youtube' && atual.youtube_id
              ? <YoutubeFacade key={atual.id} videoId={atual.youtube_id} titulo={tituloItem(atual, aberto!)} />
              : atual.tipo === 'video'
                ? <video key={atual.id} src={atual.url ?? undefined} controls playsInline preload="metadata" poster={atual.thumb_url ?? undefined} />
                : <img key={atual.id} src={atual.url ?? undefined} alt={tituloItem(atual, aberto!)} />}
            {itens.length > 1 && (
              <div className="anexo-lightbox-nav">
                <button className="btn-icon" disabled={aberto === 0} onClick={() => setAberto(aberto! - 1)} aria-label="Anterior">
                  <ChevronLeft size={20} />
                </button>
                <span>{aberto! + 1} / {itens.length}</span>
                <button className="btn-icon" disabled={aberto === itens.length - 1} onClick={() => setAberto(aberto! + 1)} aria-label="Próximo">
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
            {atual.formato && atual.bytes !== undefined && (
              <p className="anexos-dica">
                {atual.formato.toUpperCase()} · {formatarBytes(atual.bytes)}
                {atual.largura && atual.altura ? ` · ${atual.largura}×${atual.altura}` : ''}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
