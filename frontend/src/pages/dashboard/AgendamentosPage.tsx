import { useState, useEffect, useCallback, useRef } from 'react';
import { listAgendamentos, updateStatus, deleteAgendamento, getAgendamentosVolume } from '../../api/agendamentos';
import { getFinanceiroResumo } from '../../api/profissionais';
import type { Agendamento, AgendamentoStatus, AgendamentoVolume, FinanceiroResumo } from '../../types';
import { Badge } from '../../components/Badge';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Calendar, Phone, DollarSign, TrendingUp,
  CheckCircle, CalendarDays, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

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
    `✅ *Agendamento Confirmado!*`,
    ``,
    `Olá, *${ag.nome_cliente}*! Tudo certo para o seu horário. 🎉`,
    ``,
    `*Detalhes do seu agendamento:*`,
    `✂️ *Serviço:* ${nomesServicos}`,
    ...(ag.profissional_nome ? [`👤 *Profissional:* ${ag.profissional_nome}`] : []),
    `📅 *Data:* ${dataFormatada}`,
    `⏰ *Horário:* ${horario}`,
    `💰 *Valor:* ${preco}`,
    ``,
    `⚠️ _Em caso de imprevisto, avise com antecedência._`,
    ``,
    `Te esperamos! 👋`,
    ...(empresaNome ? [`_— ${empresaNome}_`] : []),
  ];

  return `https://wa.me/${formatWhatsapp(ag.whatsapp_cliente)}?text=${encodeURIComponent(linhas.join('\n'))}`;
}

function openWhatsApp(url: string) {
  window.open(url, 'whatsapp_panel');
}

/* ── KPI section ─────────────────────────────────────────────────────────── */
function KpiSection({ todayCount }: { todayCount: number }) {
  const [resumo, setResumo] = useState<FinanceiroResumo | null>(null);

  useEffect(() => {
    getFinanceiroResumo().then(setResumo).catch(() => {});
  }, []);

  const fmtMoeda = (v: string) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

  if (!resumo) {
    return (
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi-card">
            <div className="skeleton skeleton-row" style={{ width: '60%' }} />
            <div className="skeleton" style={{ height: 32, width: '80%', marginTop: 4 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="kpi-grid">
      <div className="kpi-card card--highlight-green">
        <div className="kpi-header">
          <span className="kpi-label">Receita bruta</span>
          <div className="kpi-icon kpi-icon--green"><DollarSign size={18} /></div>
        </div>
        <div className="kpi-value">{fmtMoeda(resumo.receita_bruta)}</div>
        <span className="kpi-trend">Mês atual</span>
      </div>

      <div className="kpi-card card--highlight-blue">
        <div className="kpi-header">
          <span className="kpi-label">Confirmados</span>
          <div className="kpi-icon kpi-icon--blue"><CheckCircle size={18} /></div>
        </div>
        <div className="kpi-value">{resumo.agendamentos_confirmados}</div>
        <span className="kpi-trend">Este mês</span>
      </div>

      <div className="kpi-card card--highlight-purple">
        <div className="kpi-header">
          <span className="kpi-label">Ticket médio</span>
          <div className="kpi-icon kpi-icon--purple"><TrendingUp size={18} /></div>
        </div>
        <div className="kpi-value">{fmtMoeda(resumo.ticket_medio)}</div>
        <span className="kpi-trend">Por agendamento</span>
      </div>

      <div className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-label">Hoje</span>
          <div className="kpi-icon kpi-icon--yellow"><CalendarDays size={18} /></div>
        </div>
        <div className="kpi-value">{todayCount}</div>
        <span className="kpi-trend">Agendamentos hoje</span>
      </div>
    </div>
  );
}

/* ── Volume chart ────────────────────────────────────────────────────────── */
function VolumeChart() {
  const { theme } = useTheme();
  const [volume, setVolume] = useState<AgendamentoVolume | null>(null);

  useEffect(() => {
    getAgendamentosVolume().then(setVolume).catch(() => {});
  }, []);

  const axisColor = theme === 'dark' ? 'var(--text-muted)' : '#888';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  if (!volume) {
    return (
      <div className="chart-card">
        <p className="chart-title">Volume por dia da semana</p>
        <div className="skeleton" style={{ height: 160, borderRadius: 8, marginTop: 8 }} />
      </div>
    );
  }

  return (
    <div className="chart-card">
      <p className="chart-title">Volume por dia da semana</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={volume.por_dia_semana} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="dia" tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
            labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
            itemStyle={{ color: 'var(--primary)' }}
            formatter={(v) => [v ?? 0, 'Agendamentos']}
          />
          <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function AgendamentosPage() {
  const { empresa } = useAuth();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [tab, setTab] = useState<TabValue>('hoje');
  const [loading, setLoading] = useState(true);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState(0);

  const fetchData = useCallback(async (silent = false) => {
    silent ? setAutoRefreshing(true) : setLoading(true);

    const statusFilter =
      tab === 'todos' || tab === 'hoje' ? undefined : (tab as AgendamentoStatus);

    const data = await listAgendamentos(statusFilter);

    // atualiza contagem de hoje a cada fetch (usa os dados de "todos")
    if (tab === 'hoje' || tab === 'todos') {
      setTodayCount(data.filter((ag) => isToday(ag.data_hora)).length);
    }

    const resultado = tab === 'hoje' ? data.filter((ag) => isToday(ag.data_hora)) : data;
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
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="page-subtitle">Visão geral e agendamentos</p>
        </div>
        {autoRefreshing && (
          <span className="auto-refresh-label">
            <Clock size={12} /> atualizando...
          </span>
        )}
      </div>

      <KpiSection todayCount={todayCount} />

      <VolumeChart />

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
