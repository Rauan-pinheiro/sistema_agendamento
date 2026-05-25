import { useState, useEffect, useCallback, useRef } from 'react';
import { listAgendamentos, updateStatus, deleteAgendamento } from '../../api/agendamentos';
import type { Agendamento, AgendamentoStatus } from '../../types';
import { Badge } from '../../components/Badge';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Phone, DollarSign, Clock, User } from 'lucide-react';

type TabValue = AgendamentoStatus | 'todos' | 'hoje';

const TABS: { label: string; value: TabValue }[] = [
  { label: 'Hoje',        value: 'hoje' },
  { label: 'Todos',       value: 'todos' },
  { label: 'Pendentes',   value: 'pendente' },
  { label: 'Confirmados', value: 'confirmado' },
  { label: 'Cancelados',  value: 'cancelado' },
];

const POLL_INTERVAL_MS = 30_000;

function isToday(iso: string): boolean {
  const hoje = new Date();
  const data = new Date(iso);
  return (
    data.getDate()     === hoje.getDate()     &&
    data.getMonth()    === hoje.getMonth()    &&
    data.getFullYear() === hoje.getFullYear()
  );
}

function formatDataAtual(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatPreco(preco: string) {
  return parseFloat(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatWhatsapp(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function buildWhatsappUrl(ag: Agendamento, empresaNome: string): string {
  const data = new Date(ag.data_hora);
  const dataFormatada = data.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const horario = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const preco = formatPreco(ag.preco_total);
  const nomesServicos = ag.servicos_info?.length
    ? ag.servicos_info.map((s) => s.nome).join(', ')
    : (ag.servico_nome ?? '—');

  const linhas = [
    `*Agendamento Confirmado!*`,
    ``,
    `Olá, *${ag.nome_cliente}*! Tudo certo para o seu horário.`,
    ``,
    `*Detalhes do seu agendamento:*`,
    `*Serviço:* ${nomesServicos}`,
    ...(ag.profissional_nome ? [`*Profissional:* ${ag.profissional_nome}`] : []),
    `*Data:* ${dataFormatada}`,
    `*Horário:* ${horario}`,
    `*Valor:* ${preco}`,
    ``,
    `_Em caso de imprevisto, avise com antecedência._`,
    ``,
    `Te esperamos!`,
    ...(empresaNome ? [`_— ${empresaNome}_`] : []),
  ];

  return `https://wa.me/${formatWhatsapp(ag.whatsapp_cliente)}?text=${encodeURIComponent(linhas.join('\n'))}`;
}

function openWhatsApp(url: string) {
  window.open(url, 'whatsapp_panel');
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function AgendamentosPage() {
  const { empresa } = useAuth();
  const [allAgendamentos, setAllAgendamentos] = useState<Agendamento[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [tab, setTab] = useState<TabValue>('hoje');
  const [loading, setLoading] = useState(true);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const todayCount   = allAgendamentos.filter((ag) => isToday(ag.data_hora)).length;
  const pendingCount = allAgendamentos.filter((ag) => ag.status === 'pendente').length;

  const fetchData = useCallback(async (silent = false) => {
    silent ? setAutoRefreshing(true) : setLoading(true);

    const data = await listAgendamentos();
    setAllAgendamentos(data);

    let resultado: Agendamento[];
    if (tab === 'hoje') {
      resultado = data.filter((ag) => isToday(ag.data_hora));
    } else if (tab === 'todos') {
      resultado = data;
    } else {
      resultado = data.filter((ag) => ag.status === tab);
    }

    setAgendamentos(resultado);
    setLoading(false);
    setAutoRefreshing(false);
  }, [tab]);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  useEffect(() => {
    setConfirmDeleteId(null);
    fetchData(false);
  }, [fetchData]);

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
      <div className="focus-header">
        <div>
          <h2 className="focus-date">{formatDataAtual()}</h2>
          <p className="focus-stats">
            <span>{todayCount} agendamento{todayCount !== 1 ? 's' : ''} hoje</span>
            {pendingCount > 0 && (
              <span className="focus-stats-pending">
                {' '}· {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        {autoRefreshing && (
          <span className="auto-refresh-label">
            <Clock size={12} /> atualizando...
          </span>
        )}
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
        <div className="card-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card" style={{ height: 120 }}>
              <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="skeleton skeleton-row" style={{ width: '40%' }} />
                <div className="skeleton skeleton-row--sm" />
                <div className="skeleton skeleton-row--sm" style={{ width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : agendamentos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Calendar size={28} /></div>
          <h3>
            {tab === 'hoje'
              ? 'Nenhum agendamento para hoje'
              : 'Nenhum agendamento encontrado'}
          </h3>
          <p className="empty-hint">
            {tab === 'hoje'
              ? 'Quando um cliente agendar para hoje, aparecerá aqui automaticamente.'
              : 'Aguardando novos agendamentos.'}
          </p>
        </div>
      ) : (
        <div className="card-list">
          {agendamentos.map((ag) => (
            <div key={ag.id} className="card agendamento-card">
              <div className="agendamento-header">
                <div>
                  <p className="agendamento-cliente">{ag.nome_cliente}</p>
                  <p className="agendamento-servico">
                    {ag.servicos_info?.length
                      ? ag.servicos_info.map((s) => s.nome).join(' + ')
                      : (ag.servico_nome ?? '—')}
                  </p>
                </div>
                <Badge status={ag.status} />
              </div>

              <div className="agendamento-info">
                <span className="agendamento-info-item">
                  <Calendar size={13} />
                  {formatDataHora(ag.data_hora)}
                </span>
                <span className="agendamento-info-item">
                  <User size={13} />
                  {ag.profissional_nome
                    ? ag.profissional_nome
                    : <em className="agendamento-sem-profissional">Sem profissional</em>}
                </span>
                <span className="agendamento-info-item">
                  <Phone size={13} />
                  {ag.whatsapp_cliente}
                </span>
                <span className="agendamento-info-item">
                  <DollarSign size={13} />
                  {formatPreco(ag.preco_total)}
                </span>
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
                    onClick={() => openWhatsApp(buildWhatsappUrl(ag, empresa?.nome_fantasia ?? ''))}
                  >
                    WhatsApp
                  </button>
                </div>
              )}

              <div className="agendamento-delete-row">
                {confirmDeleteId === ag.id ? (
                  <>
                    <span className="agendamento-delete-confirm-text">Excluir permanentemente?</span>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ag.id)}>
                      Sim, excluir
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDeleteId(null)}>
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
