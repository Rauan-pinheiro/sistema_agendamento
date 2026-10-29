import { useState } from 'react';
import { Check, Clock, Play, Plus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { YoutubeFacade } from '../../components/YoutubeFacade';
import type { MidiaServico, ServicoPublico } from '../../types';
import { fmtBRL, fmtDuracao } from './util';


function Midia({ m, titulo }: { m: MidiaServico; titulo: string }) {
  if (m.tipo === 'youtube') return <YoutubeFacade key={m.id} videoId={m.youtube_id} titulo={titulo} />;
  if (m.tipo === 'video') {
    return (
      <video
        key={m.id}
        className="detalhe-midia-video"
        src={m.url ?? undefined}
        poster={m.thumb_url ?? undefined}
        controls
        playsInline
        preload="none"
        aria-label={titulo}
      />
    );
  }
  return (
    <img
      key={m.id}
      className="detalhe-midia-img"
      src={m.url ?? undefined}
      alt={titulo}
      width={m.largura ?? undefined}
      height={m.altura ?? undefined}
      decoding="async"
    />
  );
}

/**
 * "Ver mais" do serviço: descrição completa, galeria de fotos, vídeos enviados e
 * YouTube (player só carrega no clique). Permite adicionar/remover do carrinho
 * sem sair do modal, para não interromper o fluxo de agendamento.
 */
export function ServicoDetalhes({ servico, selecionado, onToggle, onClose }: {
  servico: ServicoPublico | null;
  selecionado: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const midias = servico?.midias ?? [];
  const atual = midias[Math.min(indice, midias.length - 1)];

  return (
    <Modal
      open={!!servico}
      onClose={() => { setIndice(0); onClose(); }}
      title={servico?.nome ?? ''}
      wide
      sheet
      superficie="sup-vitrine"
      footer={servico && (
        <button
          type="button"
          className={`btn btn-full ${selecionado ? 'btn-secondary' : 'btn-destaque'}`}
          onClick={() => { onToggle(); setIndice(0); onClose(); }}
        >
          {selecionado
            ? <><Check size={16} /> Remover da seleção</>
            : <><Plus size={16} /> Adicionar · {fmtBRL(Number(servico.preco))}</>}
        </button>
      )}
    >
      {servico && (
        <div className="detalhe-servico">
          <p className="detalhe-meta">
            <span>{fmtBRL(Number(servico.preco))}</span>
            <span aria-hidden>·</span>
            <span><Clock size={13} aria-hidden /> {fmtDuracao(servico.duracao_min)}</span>
          </p>

          {atual && (
            <div className="detalhe-galeria">
              <div className="detalhe-midia">
                <Midia m={atual} titulo={`${servico.nome} — mídia ${indice + 1} de ${midias.length}`} />
              </div>
              {midias.length > 1 && (
                <div className="detalhe-thumbs" role="tablist" aria-label="Fotos e vídeos">
                  {midias.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={i === indice}
                      aria-label={`${m.tipo === 'imagem' ? 'Foto' : 'Vídeo'} ${i + 1}`}
                      className={`detalhe-thumb${i === indice ? ' detalhe-thumb--ativo' : ''}`}
                      onClick={() => setIndice(i)}
                    >
                      {m.thumb_url && <img src={m.thumb_url} alt="" loading="lazy" decoding="async" />}
                      {m.tipo !== 'imagem' && <span className="anexo-play" aria-hidden><Play size={12} fill="currentColor" /></span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {servico.descricao
            ? <p className="detalhe-descricao">{servico.descricao}</p>
            : !atual && <p className="anexos-dica">Sem descrição adicional.</p>}
        </div>
      )}
    </Modal>
  );
}
