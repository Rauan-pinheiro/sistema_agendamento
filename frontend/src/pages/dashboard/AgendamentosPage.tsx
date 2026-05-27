import { useState, useEffect, useCallback, useRef } from 'react';
import { listAgendamentos, updateStatus, deleteAgendamento } from '../../api/agendamentos';
import type { Agendamento, AgendamentoStatus, Empresa } from '../../types';
import { Badge } from '../../components/Badge';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Phone, DollarSign, Clock, User, ChevronDown } from 'lucide-react';
import { formatPhone } from '../../utils/phone';

type TabValue = AgendamentoStatus | 'todos' | 'hoje';

const TABS: { label: string; value: TabValue }[] = [
  { label: 'Hoje',        value: 'hoje' },
  { label: 'Todos',       value: 'todos' },
  { label: 'Pendentes',   value: 'pendente' },
  { label: 'Confirmados', value: 'confirmado' },
  { label: 'Cancelados',  value: 'cancelado' },
];

const POLL_INTERVAL_MS = 30_000;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

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

function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatPreco(preco: string) {
  return parseFloat(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatWhatsapp(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function displayPhone(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return formatPhone(local);
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/* ── Props compartilhados entre Timeline e CardList ─────────────────────── */
interface SharedCardProps {
  empresa: Empresa | null;
  confirmDeleteId: number | null;
  expandedId: number | null;
  quickActionId: number | null;
  onToggleExpand: (id: number) => void;
  onStatus: (id: number, status: AgendamentoStatus) => void;
  onDeleteRequest: (id: number) => void;
  onDeleteConfirm: (id: number) => void;
  onDeleteCancel: () => void;
  onQuickAction: (id: number) => void;
  onQuickActionCancel: () => void;
}

/* ── Expanded card panel ─────────────────────────────────────────────────── */
interface ExpandedCardPanelProps {
  ag: Agendamento;
  empresa: Empresa | null;
  confirmDeleteId: number | null;
  onStatus: (id: number, status: AgendamentoStatus) => void;
  onDeleteRequest: (id: number) => void;
  onDeleteConfirm: (id: number) => void;
  onDeleteCancel: () => void;
}

function ExpandedCardPanel({
  ag,
  empresa,
  confirmDeleteId,
  onStatus,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: ExpandedCardPanelProps) {
  const servicos = ag.servicos_info?.length
    ? ag.servicos_info
    : ag.servico_nome
      ? [{ id: -1, nome: ag.servico_nome, duracao_min: ag.duracao_total_min, preco: ag.servico_preco ?? '0' }]
      : [];

  return (
    // stopPropagation prevents clicks inside the panel from toggling the card closed
    <div className="expanded-panel" onClick={(e) => e.stopPropagation()}>

      {/* Services list */}
      <div>
        <p className="expanded-section-label">Serviços</p>
        <div className="expanded-services">
          {servicos.length > 0 ? (
            servicos.map((s) => (
              <div key={s.id} className="expanded-service-row">
                <span className="expanded-service-name">{s.nome}</span>
                <span className="expanded-service-duration">{s.duracao_min} min</span>
              </div>
            ))
          ) : (
            <p className="expanded-empty">—</p>
          )}
        </div>
      </div>

      {/* Professional */}
      <div>
        <p className="expanded-section-label">Profissional</p>
        <div className="expanded-professional">
          <div className={`expanded-avatar${ag.profissional_nome ? '' : ' expanded-avatar--empty'}`}>
            {ag.profissional_nome ? getInitials(ag.profissional_nome) : '?'}
          </div>
          <span>
            {ag.profissional_nome
              ? ag.profissional_nome
              : <em className="agendamento-sem-profissional">Sem profissional</em>}
          </span>
        </div>
      </div>

      {/* WhatsApp link — visible for pendente and confirmado */}
      {(ag.status === 'pendente' || ag.status === 'confirmado') && (
        <div>
          <button
            className="btn btn-whatsapp btn-sm"
            onClick={() => openWhatsApp(buildWhatsappUrl(ag, empresa?.nome_fantasia ?? ''))}
          >
            Enviar mensagem WhatsApp
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="expanded-actions">
        <div className="expanded-actions-main">
          {ag.status === 'pendente' && (
            <>
              <button
                className="btn btn-success btn-sm"
                onClick={() => onStatus(ag.id, 'confirmado')}
              >
                Confirmar
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => onStatus(ag.id, 'cancelado')}
              >
                Cancelar
              </button>
            </>
          )}
        </div>
        <div className="expanded-actions-delete">
          {confirmDeleteId === ag.id ? (
            <>
              <span className="agendamento-delete-confirm-text">Excluir permanentemente?</span>
              <button className="btn btn-danger btn-sm" onClick={() => onDeleteConfirm(ag.id)}>
                Sim
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onDeleteCancel}>
                Não
              </button>
            </>
          ) : (
            <button
              className="btn btn-ghost btn-sm agendamento-delete-btn"
              onClick={() => onDeleteRequest(ag.id)}
            >
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Badge clicável com micro-confirmação inline ─────────────────────────── */
function BadgeOrQuickAction({
  ag,
  quickActionId,
  onQuickAction,
  onQuickActionCancel,
  onStatus,
}: {
  ag: Agendamento;
  quickActionId: number | null;
  onQuickAction: (id: number) => void;
  onQuickActionCancel: () => void;
  onStatus: (id: number, status: AgendamentoStatus) => void;
}) {
  if (ag.status !== 'pendente' && ag.status !== 'confirmado') {
    return <Badge status={ag.status} />;
  }

  if (quickActionId === ag.id) {
    const isConfirm = ag.status === 'pendente';
    return (
      <div className="quick-action-inline" onClick={(e) => e.stopPropagation()}>
        <span className="quick-action-label">{isConfirm ? 'Confirmar?' : 'Cancelar?'}</span>
        <button
          className={`quick-action-btn ${isConfirm ? 'quick-action-btn--confirm' : 'quick-action-btn--cancel'}`}
          title={isConfirm ? 'Confirmar agendamento' : 'Cancelar agendamento'}
          onClick={() => { onStatus(ag.id, isConfirm ? 'confirmado' : 'cancelado'); onQuickActionCancel(); }}
        >
          ✓
        </button>
        <button
          className="quick-action-btn quick-action-btn--dismiss"
          title="Fechar"
          onClick={(e) => { e.stopPropagation(); onQuickActionCancel(); }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      className={`badge badge--${ag.status} badge--clickable`}
      title={ag.status === 'pendente' ? 'Clique para confirmar rapidamente' : 'Clique para cancelar rapidamente'}
      onClick={(e) => { e.stopPropagation(); onQuickAction(ag.id); }}
    >
      {ag.status === 'pendente' ? 'Pendente' : 'Confirmado'}
    </button>
  );
}

/* ── Today view helpers ───────────────────────────────────────────────────── */
function isInProgress(ag: Agendamento): boolean {
  const now = Date.now();
  const start = new Date(ag.data_hora).getTime();
  const end = start + (ag.duracao_total_min || 30) * 60_000;
  return start <= now && now < end;
}

type TimePeriod = 'Manhã' | 'Tarde' | 'Noite';

function getTimePeriod(iso: string): TimePeriod {
  const hour = new Date(iso).getHours();
  if (hour < 12) return 'Manhã';
  if (hour < 18) return 'Tarde';
  return 'Noite';
}

/* ── Today card list (aba Hoje) ───────────────────────────────────────────── */
function TodayView({
  agendamentos,
  empresa,
  confirmDeleteId,
  expandedId,
  quickActionId,
  onToggleExpand,
  onStatus,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onQuickAction,
  onQuickActionCancel,
}: { agendamentos: Agendamento[] } & SharedCardProps) {
  const sorted = [...agendamentos].sort(
    (a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
  );

  const periods: TimePeriod[] = ['Manhã', 'Tarde', 'Noite'];
  const groups: Record<TimePeriod, Agendamento[]> = { 'Manhã': [], 'Tarde': [], 'Noite': [] };
  for (const ag of sorted) groups[getTimePeriod(ag.data_hora)].push(ag);

  return (
    <div className="today-list">
      {periods.map((period) => {
        const items = groups[period];
        if (items.length === 0) return null;
        return (
          <div key={period} className="today-section">
            <div className="today-section-divider">
              <span className="today-section-label">{period}</span>
              <div className="today-section-line" />
            </div>
            <div className="card-list">
              {items.map((ag) => {
                const inProgress = isInProgress(ag);
                const isExpanded = expandedId === ag.id;
                const timeLabel = new Date(ag.data_hora).toLocaleTimeString('pt-BR', {
                  hour: '2-digit', minute: '2-digit',
                });
                const nomesServicos = ag.servicos_info?.length
                  ? ag.servicos_info.map((s) => s.nome).join(' + ')
                  : (ag.servico_nome ?? '—');

                return (
                  <div
                    key={ag.id}
                    className={`card today-card today-card--${ag.status}${inProgress ? ' today-card--in-progress' : ''}${isExpanded ? ' card--expanded' : ''} card--expandable`}
                    onClick={() => onToggleExpand(ag.id)}
                  >
                    <div className="today-card-body">
                      <div className="today-card-header">
                        <div className="today-card-header-left">
                          <span className="today-time-pill">{timeLabel}</span>
                          <div className="today-card-identity">
                            {inProgress && (
                              <span className="today-in-progress-badge">Em atendimento</span>
                            )}
                            <p className="today-card-name">{ag.nome_cliente}</p>
                            <p className="today-card-services">{nomesServicos}</p>
                            <p className="today-card-professional">
                              <User size={12} />
                              {ag.profissional_nome
                                ? ag.profissional_nome
                                : <em className="agendamento-sem-profissional">Sem profissional</em>}
                            </p>
                          </div>
                        </div>
                        <div className="today-card-header-right">
                          <BadgeOrQuickAction
                            ag={ag}
                            quickActionId={quickActionId}
                            onQuickAction={onQuickAction}
                            onQuickActionCancel={onQuickActionCancel}
                            onStatus={onStatus}
                          />
                          <ChevronDown
                            size={15}
                            className={`expand-chevron${isExpanded ? ' expand-chevron--open' : ''}`}
                          />
                        </div>
                      </div>

                      <div className="today-card-meta">
                        <span className="today-card-meta-item">
                          <Clock size={12} /> {ag.duracao_total_min}min
                        </span>
                        <span className="today-card-meta-item">
                          <Phone size={12} /> {ag.whatsapp_cliente}
                        </span>
                        <span className="today-card-meta-item today-card-meta-preco">
                          <DollarSign size={12} /> {formatPreco(ag.preco_total)}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <ExpandedCardPanel
                        ag={ag}
                        empresa={empresa}
                        confirmDeleteId={confirmDeleteId}
                        onStatus={onStatus}
                        onDeleteRequest={onDeleteRequest}
                        onDeleteConfirm={onDeleteConfirm}
                        onDeleteCancel={onDeleteCancel}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Grade de cards (abas Todos / status) ────────────────────────────────── */
function AgendamentoCardList({
  agendamentos,
  empresa,
  confirmDeleteId,
  expandedId,
  quickActionId,
  onToggleExpand,
  onStatus,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onQuickAction,
  onQuickActionCancel,
}: { agendamentos: Agendamento[] } & SharedCardProps) {
  return (
    <div className="card-list">
      {agendamentos.map((ag) => {
        const isExpanded = expandedId === ag.id;
        return (
          <div
            key={ag.id}
            className={`card agendamento-card card--expandable${isExpanded ? ' card--expanded' : ''}`}
            onClick={() => onToggleExpand(ag.id)}
          >
            <div className="agendamento-header">
              <div className="agendamento-identity">
                <p className="agendamento-cliente">{ag.nome_cliente}</p>
                <p className="agendamento-phone">
                  <Phone size={12} />{displayPhone(ag.whatsapp_cliente)}
                </p>
              </div>
              <div className="agendamento-header-right">
                <BadgeOrQuickAction
                  ag={ag}
                  quickActionId={quickActionId}
                  onQuickAction={onQuickAction}
                  onQuickActionCancel={onQuickActionCancel}
                  onStatus={onStatus}
                />
                <ChevronDown
                  size={15}
                  className={`expand-chevron${isExpanded ? ' expand-chevron--open' : ''}`}
                />
              </div>
            </div>

            <p className="agendamento-servico">
              {ag.servicos_info?.length
                ? ag.servicos_info.map((s) => s.nome).join(' + ')
                : (ag.servico_nome ?? '—')}
            </p>

            <div className="agendamento-info">
              <span className="agendamento-info-item agendamento-info-prof">
                <User size={13} />
                {ag.profissional_nome
                  ? ag.profissional_nome
                  : <em className="agendamento-sem-profissional">Sem profissional</em>}
              </span>
              <span className="agendamento-info-item">
                <Calendar size={13} />{formatData(ag.data_hora)}
              </span>
              <span className="agendamento-info-item agendamento-info-time">
                <Clock size={13} />{formatHora(ag.data_hora)}
              </span>
              <span className="agendamento-info-item agendamento-info-preco">
                <DollarSign size={13} />{formatPreco(ag.preco_total)}
              </span>
            </div>

            {isExpanded && (
              <ExpandedCardPanel
                ag={ag}
                empresa={empresa}
                confirmDeleteId={confirmDeleteId}
                onStatus={onStatus}
                onDeleteRequest={onDeleteRequest}
                onDeleteConfirm={onDeleteConfirm}
                onDeleteCancel={onDeleteCancel}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyState({ tab }: { tab: TabValue }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Calendar size={28} /></div>
      <h3>
        {tab === 'hoje' ? 'Nenhum agendamento para hoje' : 'Nenhum agendamento encontrado'}
      </h3>
      <p className="empty-hint">
        {tab === 'hoje'
          ? 'Quando um cliente agendar para hoje, aparecerá aqui automaticamente.'
          : 'Aguardando novos agendamentos.'}
      </p>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function AgendamentosPage() {
  const { empresa } = useAuth();
  const [allAgendamentos, setAllAgendamentos] = useState<Agendamento[]>([]);
  const [agendamentos, setAgendamentos]       = useState<Agendamento[]>([]);
  const [tab, setTab]                         = useState<TabValue>('hoje');
  const [loading, setLoading]                 = useState(true);
  const [autoRefreshing, setAutoRefreshing]   = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId]           = useState<number | null>(null);
  const [quickActionId, setQuickActionId]     = useState<number | null>(null);

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
    setExpandedId(null);
    setQuickActionId(null);
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
    setExpandedId(null);
    fetchData(true);
  }

  function handleToggleExpand(id: number) {
    setConfirmDeleteId(null);
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const sharedProps: SharedCardProps = {
    empresa,
    confirmDeleteId,
    expandedId,
    quickActionId,
    onToggleExpand:      handleToggleExpand,
    onStatus:            handleStatus,
    onDeleteRequest:     (id) => setConfirmDeleteId(id),
    onDeleteConfirm:     handleDelete,
    onDeleteCancel:      () => setConfirmDeleteId(null),
    onQuickAction:       (id) => { setQuickActionId(id); },
    onQuickActionCancel: () => setQuickActionId(null),
  };

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
        <EmptyState tab={tab} />
      ) : tab === 'hoje' ? (
        <TodayView agendamentos={agendamentos} {...sharedProps} />
      ) : (
        <AgendamentoCardList agendamentos={agendamentos} {...sharedProps} />
      )}
    </div>
  );
}
