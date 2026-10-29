import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listAgendamentos, getAgendamentosResumo, updateStatus, deleteAgendamento,
  type ListAgendamentosParams,
} from '../../api/agendamentos';
import type { Agendamento, AgendamentoStatus, AgendamentosResumo, Empresa } from '../../types';
import { Badge } from '../../components/Badge';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Phone, DollarSign, Clock, User, ChevronDown, Bell, Paperclip, WifiOff } from 'lucide-react';
import { AnexosAgendamento } from '../../components/AnexosAgendamento';
import { mensagemDeErro } from '../../utils/erros';
import { buildWhatsappUrl, displayPhone, openWhatsApp } from '../../utils/whatsapp';

type TabValue = AgendamentoStatus | 'todos' | 'hoje';

const TABS: { label: string; value: TabValue }[] = [
  { label: 'Hoje',        value: 'hoje' },
  { label: 'Todos',       value: 'todos' },
  { label: 'Pendentes',   value: 'pendente' },
  { label: 'Confirmados', value: 'confirmado' },
  { label: 'Cancelados',  value: 'cancelado' },
];

const POLL_MIN_MS    = 15_000;
const POLL_MAX_MS    = 60_000;
const BACKOFF_CYCLES = 3;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

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

      {/* Fotos e vídeos do atendimento (somente o dono) */}
      <AnexosAgendamento agendamentoId={ag.id} />

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
                        {!!ag.total_anexos && (
                          <span className="today-card-meta-item" title="Fotos e vídeos anexados">
                            <Paperclip size={12} /> {ag.total_anexos}
                          </span>
                        )}
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
              {!!ag.total_anexos && (
                <span className="agendamento-info-item" title="Fotos e vídeos anexados">
                  <Paperclip size={13} />{ag.total_anexos}
                </span>
              )}
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

/* ── Toast de novo agendamento ───────────────────────────────────────────── */
function NewAgendamentosToast({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <div className="new-ags-toast" role="status" aria-live="polite">
      <Bell size={14} />
      <span>
        {count} novo{count !== 1 ? 's' : ''} agendamento{count !== 1 ? 's' : ''}
      </span>
      <button
        className="new-ags-toast-dismiss"
        aria-label="Fechar notificação"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
      >
        ✕
      </button>
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
type Periodo = 'proximos' | 'anteriores';

const PAGE_SIZE = 50;

/** Data local no formato YYYY-MM-DD (toISOString usaria UTC e erraria o dia à noite). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function paramsDaAba(tab: TabValue, periodo: Periodo): ListAgendamentosParams {
  const hoje = new Date();
  if (tab === 'hoje') return { data_inicio: isoLocal(hoje), data_fim: isoLocal(hoje), page_size: 100 };
  const status = tab === 'todos' ? undefined : tab;
  if (periodo === 'anteriores') {
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    return { status, data_fim: isoLocal(ontem), ordem: 'desc', page_size: PAGE_SIZE };
  }
  return { status, data_inicio: isoLocal(hoje), page_size: PAGE_SIZE };
}

/** Lista de agendamentos com filtros. `embutida`: dentro da Agenda (sem cabeçalho próprio). */
export function AgendamentosPage({ embutida = false }: { embutida?: boolean }) {
  const { empresa } = useAuth();
  const [agendamentos, setAgendamentos]       = useState<Agendamento[]>([]);
  const [total, setTotal]                     = useState(0);
  const [pagina, setPagina]                   = useState(1);
  const [tab, setTab]                         = useState<TabValue>(embutida ? 'todos' : 'hoje');
  const [periodo, setPeriodo]                 = useState<Periodo>('proximos');
  const [resumo, setResumo]                   = useState<AgendamentosResumo | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [loadingMore, setLoadingMore]         = useState(false);
  const [autoRefreshing, setAutoRefreshing]   = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId]           = useState<number | null>(null);
  const [quickActionId, setQuickActionId]     = useState<number | null>(null);
  const [newAgsCount, setNewAgsCount]         = useState(0);
  const [erroLista, setErroLista]             = useState('');

  // Backoff state (all refs — não disparam re-render)
  const pollIntervalRef     = useRef(POLL_MIN_MS);
  const cyclesWithoutNewRef = useRef(0);
  const lastMaxCreatedRef   = useRef<string | null>(null);
  const loadedCountRef      = useRef(0);
  const toastTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const todayCount   = resumo?.hoje ?? 0;
  const pendingCount = resumo?.pendentes ?? 0;

  /**
   * Recarrega a lista da aba atual. `manterQuantidade` recarrega tantos itens
   * quanto já estavam visíveis (até 100), preservando o "Carregar mais".
   */
  /** Busca a lista sem tocar no estado de carregamento antes do await. */
  const buscarLista = useCallback(async (manterQuantidade = false) => {
    try {
      const base = paramsDaAba(tab, periodo);
      const pageSize = manterQuantidade
        ? Math.min(100, Math.max(base.page_size ?? PAGE_SIZE, loadedCountRef.current))
        : base.page_size;
      const [lista, res] = await Promise.all([
        listAgendamentos({ ...base, page_size: pageSize, page: 1 }),
        getAgendamentosResumo(),
      ]);
      lastMaxCreatedRef.current = res.ultimo_criado_em;
      loadedCountRef.current = lista.results.length;
      setResumo(res);
      setAgendamentos(lista.results);
      setTotal(lista.count);
      setPagina(1);
    } catch (err) {
      setErroLista(mensagemDeErro(err, 'Não foi possível carregar os agendamentos.'));
      return;
    } finally {
      setLoading(false);
      setAutoRefreshing(false);
    }
    setErroLista('');
  }, [tab, periodo]);

  const fetchData = useCallback(async (silent = false, manterQuantidade = false) => {
    if (silent) setAutoRefreshing(true);
    else setLoading(true);
    await buscarLista(manterQuantidade);
  }, [buscarLista]);

  async function carregarMais() {
    setLoadingMore(true);
    try {
      const prox = pagina + 1;
      const lista = await listAgendamentos({ ...paramsDaAba(tab, periodo), page: prox });
      setAgendamentos((prev) => {
        const vistos = new Set(prev.map((a) => a.id));
        const novos = [...prev, ...lista.results.filter((a) => !vistos.has(a.id))];
        loadedCountRef.current = novos.length;
        return novos;
      });
      setTotal(lista.count);
      setPagina(prox);
    } finally {
      setLoadingMore(false);
    }
  }

  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  /** Polling barato: consulta só o resumo e recarrega a lista quando há agendamento novo. */
  const poll = useCallback(async () => {
    const res = await getAgendamentosResumo();
    const anterior = lastMaxCreatedRef.current;
    setResumo(res);
    if (res.ultimo_criado_em && anterior && res.ultimo_criado_em > anterior) {
      pollIntervalRef.current     = POLL_MIN_MS;
      cyclesWithoutNewRef.current = 0;
      const recentes = await listAgendamentos({ ordem: 'desc', page_size: 20 });
      const novos = recentes.results.filter((ag) => ag.criado_em > anterior).length;
      setNewAgsCount(Math.max(1, novos));
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setNewAgsCount(0), 5_000);
      await fetchDataRef.current(true, true);
      return;
    }
    lastMaxCreatedRef.current = res.ultimo_criado_em ?? anterior;
    cyclesWithoutNewRef.current += 1;
    if (cyclesWithoutNewRef.current >= BACKOFF_CYCLES) {
      cyclesWithoutNewRef.current = 0;
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, POLL_MAX_MS);
    }
  }, []);

  useEffect(() => { buscarLista(); }, [buscarLista]);

  /** Troca de aba ou período: limpa seleções e mostra o skeleton até a nova lista chegar. */
  function trocarFiltro(mudar: () => void) {
    setConfirmDeleteId(null);
    setExpandedId(null);
    setQuickActionId(null);
    setLoading(true);
    mudar();
  }

  // Polling com setTimeout recursivo — intervalo lido dinamicamente do ref
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;
      if (!document.hidden) {
        try { await poll(); } catch { /* falha de rede: tenta no próximo ciclo */ }
      }
      if (!cancelled) timeoutId = setTimeout(loop, pollIntervalRef.current);
    };

    timeoutId = setTimeout(loop, pollIntervalRef.current);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [poll]);

  // Limpa o timer do toast ao desmontar
  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  async function handleStatus(id: number, status: AgendamentoStatus) {
    // Ação do usuário → reseta backoff para manter polling responsivo
    pollIntervalRef.current     = POLL_MIN_MS;
    cyclesWithoutNewRef.current = 0;
    await updateStatus(id, status);
    fetchData(true, true);
  }

  async function handleDelete(id: number) {
    pollIntervalRef.current     = POLL_MIN_MS;
    cyclesWithoutNewRef.current = 0;
    await deleteAgendamento(id);
    setConfirmDeleteId(null);
    setExpandedId(null);
    fetchData(true, true);
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
    <div className={embutida ? 'agenda-lista' : 'page'}>
      {!embutida && <div className="focus-header">
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
      </div>}

      <div className="tabs" role="group" aria-label="Situação">
        {TABS.map((t) => (
          <button
            key={t.value}
            className={`tab${tab === t.value ? ' active' : ''}`}
            aria-pressed={tab === t.value}
            onClick={() => { if (t.value !== tab) trocarFiltro(() => setTab(t.value)); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'hoje' && (
        <div className="tabs tabs--sub" role="group" aria-label="Período">
          {(['proximos', 'anteriores'] as Periodo[]).map((p) => (
            <button
              key={p}
              className={`tab${periodo === p ? ' active' : ''}`}
              aria-pressed={periodo === p}
              onClick={() => { if (p !== periodo) trocarFiltro(() => setPeriodo(p)); }}
            >
              {p === 'proximos' ? 'A partir de hoje' : 'Anteriores'}
            </button>
          ))}
        </div>
      )}

      {newAgsCount > 0 && (
        <NewAgendamentosToast count={newAgsCount} onDismiss={() => setNewAgsCount(0)} />
      )}

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
      ) : erroLista && agendamentos.length === 0 ? (
        <div className="empty-state" role="alert">
          <div className="empty-state-icon"><WifiOff size={28} aria-hidden /></div>
          <h3>Não deu para carregar a agenda</h3>
          <p className="empty-hint">{erroLista}</p>
          <button type="button" className="btn btn-secondary" onClick={() => fetchData(false)}>Tentar de novo</button>
        </div>
      ) : agendamentos.length === 0 ? (
        <EmptyState tab={tab} />
      ) : tab === 'hoje' ? (
        <TodayView agendamentos={agendamentos} {...sharedProps} />
      ) : (
        <>
          <AgendamentoCardList agendamentos={agendamentos} {...sharedProps} />
          {agendamentos.length < total && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={carregarMais} disabled={loadingMore}>
                {loadingMore ? 'Carregando...' : `Carregar mais (${total - agendamentos.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
