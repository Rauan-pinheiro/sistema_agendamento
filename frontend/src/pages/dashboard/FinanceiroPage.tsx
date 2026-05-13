import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { getFinanceiroResumo } from '../../api/profissionais';
import type { FinanceiroResumo } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import {
  DollarSign, CheckCircle, TrendingUp, Calendar,
  XCircle, Percent, BarChart2, Clock,
} from 'lucide-react';

/* ── Constantes ──────────────────────────────────────────────────────────── */

const MESES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const CHART_COLORS = [
  '#60a5fa', '#a78bfa', '#4ade80', '#f87171',
  '#fbbf24', '#2dd4bf', '#fb923c', '#f472b6',
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function getMesesDisponiveis(): string[] {
  const now = new Date();
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

function mesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatarMes(mesRef: string): string {
  const [ano, mes] = mesRef.split('-');
  return `${MESES_NOMES[Number(mes) - 1]} de ${ano}`;
}

function fmtMoeda(valor: string | number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor));
}

function fmtMoedaShort(valor: number): string {
  if (valor >= 1000) return `R$${(valor / 1000).toFixed(1)}k`;
  return `R$${valor.toFixed(0)}`;
}

/* ── Tooltips customizados ───────────────────────────────────────────────── */

interface TooltipProps { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; }

function BarTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = label ? new Date(label + 'T12:00:00') : null;
  const diaFmt = d
    ? d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    : label;
  return (
    <div className="recharts-custom-tooltip">
      <p className="tooltip-label">{diaFmt}</p>
      <p className="tooltip-value">{fmtMoeda(payload[0].value)}</p>
      <p className="tooltip-count">{String(payload[0].payload.total)} agendamento(s)</p>
    </div>
  );
}

interface PieTooltipProps { active?: boolean; payload?: { payload: { servico: string; receita: string; total: number } }[]; }

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="recharts-custom-tooltip">
      <p className="tooltip-label">{item.servico}</p>
      <p className="tooltip-value">{fmtMoeda(item.receita)}</p>
      <p className="tooltip-count">{item.total} agendamento(s)</p>
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────────────────────────── */

interface KpiCardProps {
  label: string;
  value: string | number;
  modifier: string;
  icon: React.ReactNode;
  highlight?: string;
}

function KpiCard({ label, value, modifier, icon, highlight }: KpiCardProps) {
  return (
    <div className={`financeiro-card financeiro-card--${modifier}${highlight ? ` card--highlight-${highlight}` : ''}`}>
      <div className="financeiro-card-header">
        <span className="financeiro-card-label">{label}</span>
        <div className="financeiro-card-icon">{icon}</div>
      </div>
      <span className="financeiro-card-value">{value}</span>
    </div>
  );
}

/* ── Skeleton dos charts ─────────────────────────────────────────────────── */

function ChartSkeleton() {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div className="skeleton skeleton-row" style={{ width: '40%' }} />
        <div className="skeleton skeleton-row--sm" style={{ marginTop: 6 }} />
      </div>
      <div className="skeleton" style={{ height: 220, borderRadius: 8, marginTop: 8 }} />
    </div>
  );
}

/* ── Componente principal ────────────────────────────────────────────────── */

export function FinanceiroPage() {
  const { theme } = useTheme();
  const [mes, setMes] = useState<string>(mesAtual);
  const [resumo, setResumo] = useState<FinanceiroResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const meses = useMemo(() => getMesesDisponiveis(), []);

  // Cores de eixo dependem do tema
  const axisColor  = theme === 'dark' ? '#64748b' : '#94a3b8';
  const gridColor  = theme === 'dark' ? '#334155' : '#e8edf2';

  useEffect(() => {
    setLoading(true);
    setErro('');
    setResumo(null);
    getFinanceiroResumo(mes)
      .then((data: FinanceiroResumo) => setResumo(data))
      .catch(() => setErro('Não foi possível carregar os dados financeiros.'))
      .finally(() => setLoading(false));
  }, [mes]);

  // Dados para o gráfico de barras
  const barData = useMemo(() => {
    if (!resumo) return [];
    return resumo.por_dia.map((d) => ({
      dia: d.dia,
      receita_num: parseFloat(d.receita),
      total: d.total,
    }));
  }, [resumo]);

  // Dados para o gráfico de rosca
  const pieData = useMemo(() => {
    if (!resumo) return [];
    const totalReceita = resumo.por_servico.reduce((s, i) => s + parseFloat(i.receita), 0);
    return resumo.por_servico.map((s) => ({
      ...s,
      value: parseFloat(s.receita),
      pct: totalReceita > 0
        ? ((parseFloat(s.receita) / totalReceita) * 100).toFixed(1)
        : '0',
    }));
  }, [resumo]);

  return (
    <div className="page">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2>Financeiro</h2>
          {resumo && !loading && (
            <p className="page-subtitle">{formatarMes(resumo.mes_referencia)}</p>
          )}
        </div>
        <div className="mes-selector">
          <span className="mes-selector-label">Período:</span>
          <select
            className="mes-select"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            aria-label="Selecionar mês de referência"
          >
            {meses.map((m) => (
              <option key={m} value={m}>{formatarMes(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Erro ──────────────────────────────────────────────────────────── */}
      {erro && <p className="form-error">{erro}</p>}

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="financeiro-cards">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="financeiro-card">
              <div className="financeiro-card-header">
                <div className="skeleton" style={{ height: 38, width: 38, borderRadius: 10 }} />
              </div>
              <div className="skeleton skeleton-row" style={{ width: '55%', marginTop: 8 }} />
              <div className="skeleton" style={{ height: 34, width: '72%', marginTop: 6 }} />
            </div>
          ))}
        </div>
      ) : resumo ? (
        <div className="financeiro-cards">
          <KpiCard
            label="Receita bruta"
            value={fmtMoeda(resumo.receita_bruta)}
            modifier="receita"
            highlight="green"
            icon={<DollarSign size={20} />}
          />
          <KpiCard
            label="Confirmados"
            value={resumo.agendamentos_confirmados}
            modifier="confirmados"
            highlight="blue"
            icon={<CheckCircle size={20} />}
          />
          <KpiCard
            label="Ticket médio"
            value={fmtMoeda(resumo.ticket_medio)}
            modifier="ticket"
            highlight="purple"
            icon={<TrendingUp size={20} />}
          />
          <KpiCard
            label="Total no período"
            value={resumo.total_agendamentos}
            modifier="total"
            icon={<Calendar size={20} />}
          />
          <KpiCard
            label="Cancelados"
            value={resumo.agendamentos_cancelados}
            modifier="cancelados"
            icon={<XCircle size={20} />}
          />
          <KpiCard
            label="Pendentes"
            value={resumo.agendamentos_pendentes}
            modifier="pendentes"
            icon={<Clock size={20} />}
          />
        </div>
      ) : null}

      {/* Taxa de confirmação — destaque separado */}
      {!loading && resumo && resumo.total_agendamentos > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="financeiro-card financeiro-card--taxa" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, padding: '16px 22px' }}>
            <div className="financeiro-card-icon" style={{ flexShrink: 0 }}>
              <Percent size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <span className="financeiro-card-label">Taxa de confirmação</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                <span className="financeiro-card-value" style={{ fontSize: 26 }}>
                  {resumo.taxa_confirmacao}%
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {resumo.agendamentos_confirmados} de {resumo.total_agendamentos} agendamentos confirmados
                </span>
              </div>
            </div>
            {/* Barra de progresso */}
            <div style={{ width: 160, flexShrink: 0 }}>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${resumo.taxa_confirmacao}%`,
                    background: 'var(--success-hover)',
                    borderRadius: 99,
                    transition: 'width .5s ease',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="chart-grid">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      ) : resumo && resumo.agendamentos_confirmados > 0 ? (
        <div className="chart-grid">

          {/* Gráfico de barras — Receita por dia */}
          <div className="chart-card">
            <div className="chart-card-header">
              <p className="chart-card-title">Receita por dia</p>
              <p className="chart-card-subtitle">Soma de agendamentos confirmados</p>
            </div>
            {barData.length === 0 ? (
              <div className="chart-empty">
                <BarChart2 size={32} style={{ opacity: .3 }} />
                <span>Sem receita registrada</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fill: axisColor, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => {
                      const d = new Date(v + 'T12:00:00');
                      return String(d.getDate()).padStart(2, '0');
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: axisColor, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtMoedaShort}
                    width={52}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(96,165,250,.07)' }} />
                  <Bar
                    dataKey="receita_num"
                    fill="#60a5fa"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={44}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Gráfico de rosca — Receita por serviço */}
          <div className="chart-card">
            <div className="chart-card-header">
              <p className="chart-card-title">Receita por serviço</p>
              <p className="chart-card-subtitle">Participação de cada serviço</p>
            </div>
            {pieData.length === 0 ? (
              <div className="chart-empty">
                <BarChart2 size={32} style={{ opacity: .3 }} />
                <span>Sem dados neste período</span>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      dataKey="value"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="servico-legend">
                  {pieData.map((item, i) => (
                    <div key={i} className="servico-legend-item">
                      <span
                        className="servico-legend-dot"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="servico-legend-name">{item.servico}</span>
                      <span className="servico-legend-pct">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : resumo && resumo.total_agendamentos === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Calendar size={28} /></div>
          <h3>Sem movimentação em {formatarMes(mes)}</h3>
          <p className="empty-hint">
            Nenhum agendamento registrado neste período. Selecione outro mês ou aguarde novos agendamentos.
          </p>
        </div>
      ) : null}
    </div>
  );
}
