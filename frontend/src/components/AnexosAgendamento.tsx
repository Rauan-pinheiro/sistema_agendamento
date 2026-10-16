import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Play, RefreshCw, Trash2, X } from 'lucide-react';
import {
  confirmarAnexo, enviarParaCloudinary, listAnexos, mensagemDeErro, pedirAssinatura, removerAnexo,
} from '../api/anexos';
import type { Anexo, CotaAnexos } from '../types';
import { ACCEPT_MIDIA, comprimirImagem, formatarBytes, validarArquivo } from '../utils/midia';
import { Modal } from './Modal';

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

/**
 * Galeria de fotos e vídeos de um agendamento (somente o dono).
 * Upload direto ao Cloudinary com URL assinada; um arquivo por vez.
 */
export function AnexosAgendamento({ agendamentoId, onTotalChange }: {
  agendamentoId: number;
  onTotalChange?: (total: number) => void;
}) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [cota, setCota] = useState<CotaAnexos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [aberto, setAberto] = useState<number | null>(null); // índice no lightbox
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const substituirRef = useRef<HTMLInputElement>(null);
  const processando = useRef(false);
  const fila = useRef<Envio[]>([]);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof listAnexos>>) => {
    setAnexos(r.anexos);
    setCota(r.cota);
    setErroLista('');
    onTotalChange?.(r.anexos.length);
  }, [onTotalChange]);

  const recarregar = useCallback(async () => {
    try {
      aplicar(await listAnexos(agendamentoId));
    } catch (err) {
      setErroLista(mensagemDeErro(err, 'Não foi possível carregar os anexos.'));
    }
  }, [agendamentoId, aplicar]);

  useEffect(() => {
    let vivo = true;
    listAnexos(agendamentoId)
      .then((r) => { if (vivo) aplicar(r); })
      .catch((err) => { if (vivo) setErroLista(mensagemDeErro(err, 'Não foi possível carregar os anexos.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [agendamentoId, aplicar]);

  const atualizar = (chave: string, mudanca: Partial<Envio>) =>
    setEnvios((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...mudanca } : e)));

  async function enviarUm(envio: Envio) {
    const { chave } = envio;
    try {
      atualizar(chave, { estado: 'preparando' });
      const validacao = await validarArquivo(envio.arquivo);
      if (!validacao.ok || !validacao.mime) throw new Error(validacao.erro);
      const arquivo = validacao.tipo === 'imagem' ? await comprimirImagem(envio.arquivo) : envio.arquivo;
      const assinatura = await pedirAssinatura(
        agendamentoId,
        { nome: arquivo.name, mime: arquivo.type || validacao.mime, tamanho: arquivo.size },
        envio.substituirId,
      );
      atualizar(chave, { estado: 'enviando', progresso: 0 });
      const { public_id } = await enviarParaCloudinary(arquivo, assinatura, (p) => atualizar(chave, { progresso: p }));
      atualizar(chave, { estado: 'confirmando', progresso: 100 });
      await confirmarAnexo(agendamentoId, {
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
      while (fila.current.length) {
        await enviarUm(fila.current.shift()!);
      }
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

  async function remover(anexo: Anexo) {
    try {
      await removerAnexo(agendamentoId, anexo.id);
      setAberto(null);
      setConfirmarRemocao(false);
      await recarregar();
    } catch (err) {
      setErroLista(mensagemDeErro(err));
    }
  }

  function aoSoltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files.length) enfileirar(e.dataTransfer.files);
  }

  const atual = aberto !== null ? anexos[aberto] : null;
  const lotado = !!cota && cota.arquivos + envios.filter((e) => e.estado !== 'erro').length >= cota.max_arquivos;

  return (
    <div className="anexos" onClick={(e) => e.stopPropagation()}>
      <div className="anexos-header">
        <p className="expanded-section-label">Fotos e vídeos</p>
        {cota && (
          <span className="anexos-cota">
            {cota.arquivos}/{cota.max_arquivos} · {formatarBytes(cota.bytes)} de {formatarBytes(cota.max_bytes)}
          </span>
        )}
      </div>

      {erroLista && <p className="form-error" role="alert">{erroLista}</p>}

      <div
        className={`anexos-grid${arrastando ? ' anexos-grid--drop' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
      >
        {carregando && [0, 1, 2].map((i) => <div key={i} className="anexo-thumb skeleton" />)}

        {anexos.map((a, i) => (
          <button
            key={a.id}
            type="button"
            className="anexo-thumb"
            onClick={() => { setAberto(i); setConfirmarRemocao(false); }}
            aria-label={`Abrir ${a.tipo === 'video' ? 'vídeo' : 'foto'} ${a.nome_original || i + 1}`}
          >
            {a.thumb_url
              ? <img src={a.thumb_url} alt="" loading="lazy" decoding="async" />
              : <span className="anexo-thumb-vazio">{a.formato.toUpperCase()}</span>}
            {a.tipo === 'video' && <span className="anexo-play" aria-hidden><Play size={16} /></span>}
          </button>
        ))}

        {envios.map((e) => (
          <div key={e.chave} className={`anexo-thumb anexo-envio anexo-envio--${e.estado}`} title={e.erro || e.nome}>
            <span className="anexo-envio-nome">{e.nome}</span>
            {e.estado === 'erro' ? (
              <>
                <span className="anexo-envio-erro">{e.erro}</span>
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
          <button type="button" className="anexo-thumb anexo-adicionar" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={20} />
            <span>Adicionar</span>
          </button>
        )}
      </div>
      <p className="anexos-dica">JPG, PNG, WEBP (até 10 MB) ou MP4, WEBM (até 100 MB). Arraste arquivos para cá.</p>

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
        title={atual?.nome_original || (atual?.tipo === 'video' ? 'Vídeo' : 'Foto')}
        wide
        footer={atual && (
          confirmarRemocao ? (
            <>
              <span className="agendamento-delete-confirm-text">Remover este arquivo?</span>
              <button className="btn btn-danger btn-sm" onClick={() => remover(atual)}>Remover</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmarRemocao(false)}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => substituirRef.current?.click()}>
                <RefreshCw size={14} /> Substituir
              </button>
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
              if (e.key === 'ArrowRight' && aberto! < anexos.length - 1) setAberto(aberto! + 1);
              if (e.key === 'ArrowLeft' && aberto! > 0) setAberto(aberto! - 1);
            }}
          >
            {atual.tipo === 'video'
              ? <video key={atual.id} src={atual.url ?? undefined} controls playsInline preload="metadata" poster={atual.thumb_url ?? undefined} />
              : <img key={atual.id} src={atual.url ?? undefined} alt={atual.nome_original || 'Foto do agendamento'} />}
            {anexos.length > 1 && (
              <div className="anexo-lightbox-nav">
                <button className="btn-icon" disabled={aberto === 0} onClick={() => setAberto(aberto! - 1)} aria-label="Anterior">
                  <ChevronLeft size={20} />
                </button>
                <span>{aberto! + 1} / {anexos.length}</span>
                <button className="btn-icon" disabled={aberto === anexos.length - 1} onClick={() => setAberto(aberto! + 1)} aria-label="Próximo">
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
            <p className="anexos-dica">{atual.formato.toUpperCase()} · {formatarBytes(atual.bytes)}
              {atual.largura && atual.altura ? ` · ${atual.largura}×${atual.altura}` : ''}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
