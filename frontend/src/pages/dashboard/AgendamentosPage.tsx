import { useState, useEffect, useCallback, useRef } from 'react';
import { listAgendamentos, updateStatus, deleteAgendamento } from '../../api/agendamentos';
import type { Agendamento, AgendamentoStatus } from '../../types';

type TabValue = AgendamentoStatus | 'todos' | 'hoje';

const TABS: { label: string; value: TabValue }[] = [
  { label: 'Hoje', value: 'hoje' },
  { label: 'Todos', value: 'todos' },
  { label: 'Pendentes', value: 'pendente' },
  { label: 'Confirmados', value: 'confirmado' },
  { label: 'Cancelados', value: 'cancelado' },
];

const POLL_INTERVAL_MS = 30_000;

function isToday(iso: string): boolean {
  const hoje = new Date();
  const data = new Date(iso);
  return (
    data.getDate() === hoje.getDate() &&
    data.getMonth() === hoje.getMonth() &&
    data.getFullYear() === hoje.getFullYear()
  );
}

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

// Reutiliza a mesma janela para todos os cliques de WhatsApp.
// Se a janela ainda estiver aberta, navega ela; caso contrário, abre uma nova.
function openWhatsApp(url: string) {
  window.open(url, 'whatsapp_panel');
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
  const [tab, setTab] = useState<TabValue>('hoje');
  const [loading, setLoading] = useState(true);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    silent ? setAutoRefreshing(true) : setLoading(true);

    const statusFilter =
      tab === 'todos' || tab === 'hoje' ? undefined : (tab as AgendamentoStatus);

    const data = await listAgendamentos(statusFilter);
    const resultado = tab === 'hoje' ? data.filter((ag) => isToday(ag.data_hora)) : data;

    setAgendamentos(resultado);
    setLoading(false);
    setAutoRefreshing(false);
  }, [tab]);

  // Ref garante que o intervalo sempre chame a versão mais atual de fetchData
  // sem precisar recriar o setInterval a cada troca de aba (evita stale closure).
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  // Carga inicial e ao trocar de aba; reseta confirmação de exclusão pendente
  useEffect(() => {
    setConfirmDeleteId(null);
    fetchData(false);
  }, [fetchData]);

  // Polling silencioso — intervalo único, nunca recriado, pausa quando a aba está em segundo plano
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) fetchDataRef.current(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleStatus(id: number, status: AgendamentoStatus) {
    await updateStatus(id, status);
    fetchData(true);
  }

  async function handleDelete(id: number) {
    await deleteAgendamento(id);
    setConfirmDeleteId(null);
    fetchData(true);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Agendamentos</h2>
        {autoRefreshing && <span className="auto-refresh-label">atualizando...</span>}
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
          <p>
            {tab === 'hoje'
              ? 'Nenhum agendamento para hoje.'
              : 'Nenhum agendamento encontrado.'}
          </p>
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
                  <button
                    className="btn btn-whatsapp btn-sm"
                    onClick={() => openWhatsApp(buildWhatsappUrl(ag))}
                  >
                    WhatsApp
                  </button>
                </div>
              )}
              <div className="agendamento-delete-row">
                {confirmDeleteId === ag.id ? (
                  <>
                    <span className="agendamento-delete-confirm-text">Excluir permanentemente?</span>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(ag.id)}
                    >
                      Sim, excluir
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Não
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm agendamento-delete-btn"
                    onClick={() => setConfirmDeleteId(ag.id)}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
