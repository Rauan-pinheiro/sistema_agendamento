import { useState } from 'react';
import { Check, Clock, MessageCircle, Phone, User, X } from 'lucide-react';
import { updateStatus } from '../../../api/agendamentos';
import { AnexosAgendamento } from '../../../components/AnexosAgendamento';
import { Avatar, Badge, Modal } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useFeedback } from '../../../context/FeedbackContext';
import type { Agendamento, AgendamentoStatus } from '../../../types';
import { mensagemDeErro } from '../../../utils/erros';
import { buildWhatsappUrl, displayPhone, openWhatsApp } from '../../../utils/whatsapp';
import { brl, hora, tituloDia } from './util';

/** Detalhe de um horário: confirmar, cancelar, WhatsApp e fotos/vídeos do atendimento. */
export function DetalheAgendamento({ ag, onClose, onAtualizado }: {
  ag: Agendamento | null;
  onClose: () => void;
  onAtualizado: (ag: Agendamento) => void;
}) {
  const { empresa } = useAuth();
  const { toast, confirmar } = useFeedback();
  const [salvando, setSalvando] = useState<AgendamentoStatus | null>(null);

  async function mudar(status: AgendamentoStatus) {
    if (!ag) return;
    if (status === 'cancelado' && !(await confirmar({
      titulo: 'Cancelar este horário?', mensagem: `${ag.nome_cliente}, ${hora(ag.data_hora)}. O horário volta a ficar livre na sua página.`,
      confirmar: 'Cancelar horário', perigo: true,
    }))) return;
    setSalvando(status);
    try {
      const novo = await updateStatus(ag.id, status);
      onAtualizado({ ...ag, ...novo });
      toast(status === 'confirmado' ? 'Horário confirmado' : 'Horário cancelado');
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível atualizar o horário.'), 'erro');
    } finally {
      setSalvando(null);
    }
  }

  const fim = ag ? new Date(new Date(ag.data_hora).getTime() + ag.duracao_total_min * 60000).toISOString() : '';
  return (
    <Modal open={!!ag} onClose={onClose} title={ag?.nome_cliente ?? ''} sheet wide superficie="sup-painel"
      footer={ag && (
        <div className="detalhe-acoes">
          <button type="button" className="btn btn-whatsapp" onClick={() => openWhatsApp(buildWhatsappUrl(ag, empresa?.nome_fantasia ?? ''))}>
            <MessageCircle size={16} aria-hidden /> WhatsApp
          </button>
          {ag.status !== 'cancelado' && (
            <button type="button" className="btn btn-ghost" onClick={() => mudar('cancelado')} disabled={!!salvando}>
              {salvando === 'cancelado' ? <span className="btn-spinner" aria-hidden /> : <X size={16} aria-hidden />} Cancelar horário
            </button>
          )}
          {ag.status === 'pendente' && (
            <button type="button" className="btn btn-primary" onClick={() => mudar('confirmado')} disabled={!!salvando}>
              {salvando === 'confirmado' ? <span className="btn-spinner" aria-hidden /> : <Check size={16} aria-hidden />} Confirmar
            </button>
          )}
        </div>
      )}>
      {ag && (
        <div className="detalhe-ag">
          <div className="detalhe-ag-topo">
            <p className="detalhe-ag-quando">
              <Clock size={16} aria-hidden />
              <span><b className="num">{hora(ag.data_hora)}–{hora(fim)}</b> · {tituloDia(new Date(ag.data_hora))}</span>
            </p>
            <Badge status={ag.status} />
          </div>
          <ul className="detalhe-ag-servicos">
            {(ag.servicos_info?.length ? ag.servicos_info : [{ id: 0, nome: ag.servico_nome ?? 'Serviço', duracao_min: ag.duracao_total_min, preco: ag.preco_total }]).map((s) => (
              <li key={s.id}><span>{s.nome}</span><span className="text-muted num">{s.duracao_min} min</span><span className="num">{brl(s.preco)}</span></li>
            ))}
            <li className="detalhe-ag-total"><span>Total</span><span className="num">{ag.duracao_total_min} min</span><span className="num">{brl(ag.preco_total)}</span></li>
          </ul>
          <dl className="detalhe-ag-dados">
            <div><dt><User size={14} aria-hidden /> Profissional</dt>
              <dd>{ag.profissional_nome
                ? <span className="detalhe-ag-pro"><Avatar nome={ag.profissional_nome} tamanho={24} /> {ag.profissional_nome}</span>
                : <span className="text-muted">Sem preferência</span>}</dd></div>
            <div><dt><Phone size={14} aria-hidden /> WhatsApp</dt>
              <dd><a href={`tel:+${ag.whatsapp_cliente.replace(/\D/g, '')}`}>{displayPhone(ag.whatsapp_cliente)}</a></dd></div>
          </dl>
          <AnexosAgendamento agendamentoId={ag.id} />
        </div>
      )}
    </Modal>
  );
}
