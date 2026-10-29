import { ShoppingBag } from 'lucide-react';
import { Avatar } from '../../components/ui';
import type { ProfissionalPublico, ServicoPublico } from '../../types';
import { iniciais } from '../../utils/cor';
import { DIAS_CURTOS, deIso, fmtBRL, fmtDuracao, fotoDoServico } from './util';

interface Props {
  selecionados: ServicoPublico[];
  profissional?: ProfissionalPublico;
  data: string;
  hora?: string;
  acao: { rotulo: string; tipo: 'submit' | 'button'; desabilitado: boolean; carregando: boolean; onClick?: () => void };
}

function Miniatura({ s, tam }: { s: ServicoPublico; tam: number }) {
  const foto = fotoDoServico(s);
  return foto
    ? <img className="mini" src={foto} alt="" width={tam} height={tam} loading="lazy" decoding="async" />
    : <span className="mini mini--sigla" style={{ width: tam, height: tam }}>{iniciais(s.nome)}</span>;
}

/**
 * "Sua visita": no celular, barra fixa no rodapé (sobe ao escolher o primeiro serviço);
 * no desktop, cartão fixo ao lado da lista. É uma região só, com um botão de ação só.
 */
export function ResumoVisita({ selecionados, profissional, data, hora, acao }: Props) {
  if (selecionados.length === 0) {
    return (
      <aside className="sacola sacola--vazia" aria-labelledby="sacola-vazia-titulo">
        <span className="sacola-vazia-icone" aria-hidden><ShoppingBag size={22} /></span>
        <h2 id="sacola-vazia-titulo">Sua visita</h2>
        <p>Escolha um ou mais serviços para ver o total e os horários livres.</p>
      </aside>
    );
  }
  const total = selecionados.reduce((a, s) => a + Number(s.preco), 0);
  const duracao = selecionados.reduce((a, s) => a + s.duracao_min, 0);
  const quando = hora && data ? `${DIAS_CURTOS[deIso(data).getDay()]} ${deIso(data).getDate()} às ${hora}` : '';

  return (
    <aside className="sacola" role="region" aria-label="Resumo do agendamento">
      <h2 className="sacola-titulo">Sua visita</h2>
      <ul className="sacola-itens">
        {selecionados.map((s) => (
          <li key={s.id}>
            <Miniatura s={s} tam={48} />
            <span><b>{s.nome}</b><small>{fmtDuracao(s.duracao_min)}</small></span>
            <span className="num">{fmtBRL(Number(s.preco))}</span>
          </li>
        ))}
      </ul>
      {profissional && (
        <div className="sacola-quando">
          <Avatar nome={profissional.nome} foto={profissional.foto_url} tamanho={36} />
          <span><b>{profissional.nome}</b><small>{quando || 'Escolha o dia e o horário'}</small></span>
        </div>
      )}
      <div className="sacola-barra">
        <span className="sacola-minis" aria-hidden>
          {selecionados.slice(0, 3).map((s) => <Miniatura key={s.id} s={s} tam={36} />)}
        </span>
        <span className="sacola-texto">
          <span className="sacola-linha">{selecionados.map((s) => s.nome).join(' + ')}{quando ? `, ${quando}` : ''}</span>
          <span className="sacola-total"><span className="sacola-total-rot">Total </span><b className="num">{fmtBRL(total)}</b><small>{fmtDuracao(duracao)}</small></span>
        </span>
        <button
          type={acao.tipo}
          form={acao.tipo === 'submit' ? 'form-agendar' : undefined}
          className="btn btn-destaque sacola-acao"
          disabled={acao.desabilitado}
          onClick={acao.onClick}
        >
          {acao.carregando && <span className="btn-spinner" aria-hidden />}
          {acao.rotulo}
        </button>
      </div>
      <p className="sacola-nota">Sem cadastro. A confirmação chega no seu WhatsApp.</p>
    </aside>
  );
}
