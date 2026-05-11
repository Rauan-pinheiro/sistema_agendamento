import { useState, useEffect, useCallback } from 'react';
import { listAgendamentos, updateStatus } from '../../api/agendamentos';
import type { Agendamento, AgendamentoStatus } from '../../types';

const TABS: { label: string; value: AgendamentoStatus | 'todos' }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Pendentes', value: 'pendente' },
  { label: 'Confirmados', value: 'confirmado' },
  { label: 'Cancelados', value: 'cancelado' },
];

function formatDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPreco(preco: string) {
  return parseFloat(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatWhatsapp(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function buildWhatsappUrl(ag: Agendamento): string {
  const data = new Date(ag.data_hora);
  const dataFormatada = data.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const horario = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const mensagem = [
    `Olá *${ag.nome_cliente}*! ✅ Seu agendamento está *confirmado*:`,
    ``,
    `📋 *Serviço:* ${ag.servico_nome}`,
    `📅 *Data:* ${dataFormatada}`,
    `⏰ *Horário:* ${horario}`,
    `💰 *Valor:* ${formatPreco(ag.servico_preco)}`,
    ``,
    `Qualquer dúvida, entre em contato. Até lá! 😊`,
  ].join('\n');

  return `https://wa.me/${formatWhatsapp(ag.whatsapp_cliente)}?text=${encodeURIComponent(mensagem)}`;
}

function StatusBadge({ status }: { status: AgendamentoStatus }) {
  const labels: Record<AgendamentoStatus, string> = {
    pendente: 'Pendente',
    confirmado: 'Confirmado',
    cancelado: 'Cancelado',
  };
  return <span className={`badge badge--${status}`}>{labels[status]}</span>;
}

export function AgendamentosPage() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [tab, setTab] = useState<AgendamentoStatus | 'todos'>('todos');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const data = await listAgendamentos(tab === 'todos' ? undefined : tab);
    setAgendamentos(data);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleStatus(id: number, status: AgendamentoStatus) {
    await updateStatus(id, status);
    fetchData();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Agendamentos</h2>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            className={`tab${tab === t.value ? ' active' : ''}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="loading">Carregando...</p>
      ) : agendamentos.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum agendamento encontrado.</p>
        </div>
      ) : (
        <div className="card-list">
          {agendamentos.map((ag) => (
            <div key={ag.id} className="card agendamento-card">
              <div className="agendamento-header">
                <div>
                  <p className="agendamento-cliente">{ag.nome_cliente}</p>
                  <p className="agendamento-servico">{ag.servico_nome}</p>
                </div>
                <StatusBadge status={ag.status} />
              </div>
              <div className="agendamento-info">
                <span>📅 {formatDataHora(ag.data_hora)}</span>
                <span>📱 {ag.whatsapp_cliente}</span>
                <span>💰 {formatPreco(ag.servico_preco)}</span>
              </div>
              {(ag.status === 'pendente' || ag.status === 'confirmado') && (
                <div className="agendamento-actions">
                  {ag.status === 'pendente' && (
                    <>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleStatus(ag.id, 'confirmado')}
                      >
                        Confirmar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleStatus(ag.id, 'cancelado')}
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  <a
                    href={buildWhatsappUrl(ag)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-whatsapp btn-sm"
                  >
                    WhatsApp
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
