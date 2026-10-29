import { Check, ChevronRight, Clock, Images, Plus } from 'lucide-react';
import type { ServicoPublico } from '../../types';
import { iniciais } from '../../utils/cor';
import { fmtBRL, fmtDuracao, fotoDoServico } from './util';

interface Props {
  servico: ServicoPublico;
  selecionado: boolean;
  /** "foto": cartão com imagem grande; "compacto": linha para empresas sem fotos. */
  modo: 'foto' | 'compacto';
  onToggle: () => void;
  onVerMais: () => void;
}

/** Cartão de serviço da vitrine. Sem foto no modo "foto", a imagem vira um quadro na cor da empresa. */
export function CartaoServico({ servico: s, selecionado, modo, onToggle, onVerMais }: Props) {
  const foto = fotoDoServico(s);
  const qtdMidias = s.midias.length;
  const temVerMais = qtdMidias > 0 || s.descricao.length > 90;
  const tituloId = `servico-${s.id}`;

  const adicionar = (
    <button type="button" className="adicionar" aria-pressed={selecionado} onClick={onToggle}
      aria-label={`Adicionar ${s.nome}`}>
      {selecionado ? <Check size={18} strokeWidth={2.5} aria-hidden /> : <Plus size={18} aria-hidden />}
      <span className="adicionar-rot" aria-hidden>{selecionado ? 'Adicionado' : 'Adicionar'}</span>
    </button>
  );
  const verMais = temVerMais && (
    <button type="button" className="ver-mais" onClick={onVerMais} aria-haspopup="dialog" aria-describedby={tituloId}>
      Ver mais <ChevronRight size={14} aria-hidden />
    </button>
  );
  const preco = <span className="cartao-preco num">{fmtBRL(Number(s.preco))}</span>;

  if (modo === 'compacto') {
    return (
      <article className={`cartao-servico cartao-servico--compacto${selecionado ? ' is-sel' : ''}`}>
        <span className="cartao-quadro" aria-hidden>
          {foto ? <img src={foto} alt="" loading="lazy" decoding="async" width={64} height={64} /> : iniciais(s.nome)}
        </span>
        <div className="cartao-corpo">
          <h3 id={tituloId} className="cartao-nome">{s.nome}</h3>
          {s.descricao && <p className="cartao-desc">{s.descricao}</p>}
          <p className="cartao-meta">
            <span><Clock size={13} aria-hidden /> {fmtDuracao(s.duracao_min)}</span>
            {preco}
          </p>
          {verMais}
        </div>
        {adicionar}
      </article>
    );
  }

  return (
    <article className={`cartao-servico cartao-servico--foto${selecionado ? ' is-sel' : ''}`}>
      <figure className="cartao-figura">
        {foto
          ? <img src={foto} alt="" loading="lazy" decoding="async" width={480} height={480} />
          : <span className="cartao-quadro" aria-hidden>{iniciais(s.nome)}</span>}
        <span className="cartao-duracao"><Clock size={13} aria-hidden /> {fmtDuracao(s.duracao_min)}</span>
        {qtdMidias > 1 && <span className="cartao-qtd"><Images size={13} aria-hidden /> {qtdMidias}<span className="sr-only"> fotos e vídeos</span></span>}
      </figure>
      <div className="cartao-corpo">
        <h3 id={tituloId} className="cartao-nome">{s.nome}</h3>
        {s.descricao && <p className="cartao-desc">{s.descricao}</p>}
        {verMais}
        <div className="cartao-rodape">
          {preco}
          {adicionar}
        </div>
      </div>
    </article>
  );
}
