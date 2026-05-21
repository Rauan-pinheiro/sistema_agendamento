import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  getEmpresaPublica,
  listServicosPublicos,
  listProfissionaisPublicos,
  createAgendamentoPublico,
  getHorariosDisponiveis,
} from '../../api/public';
import type { Empresa, Servico, ProfissionalPublico, SlotDisponivel } from '../../types';
import { CheckCircle, MessageCircle, Check } from 'lucide-react';
import { formatPhone, normalizePhone, isValidPhone } from '../../utils/phone';

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function hoje(): string {
  return new Date().toISOString().split('T')[0];
}

function initials(nome: string): string {
  return nome.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

function fmtBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ── Progress bar ────────────────────────────────────────────────────────── */
interface ProgressStep {
  label: string;
  state: 'done' | 'current' | 'pending';
}

function ProgressBar({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="progress-bar-wrap">
      <div className="progress-steps">
        {steps.map((step, i) => (
          <div key={i} className={`progress-step ${step.state}`}>
            <div className="progress-step-num">
              {step.state === 'done' ? <Check size={13} /> : i + 1}
            </div>
            <span className="progress-step-label">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Calendar picker ─────────────────────────────────────────────────────── */
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_LABELS  = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function CalendarPicker({ value, onChange, min }: {
  value: string; onChange: (d: string) => void; min: string;
}) {
  const todayObj = new Date();
  const [viewYear,  setViewYear]  = useState(todayObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayObj.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const rawDow = new Date(viewYear, viewMonth, 1).getDay();
  const firstDow = rawDow === 0 ? 6 : rawDow - 1;
  const minDateObj = new Date(min + 'T00:00:00');

  return (
    <div className="calendar-picker">
      <div className="calendar-header">
        <button type="button" className="calendar-nav-btn" onClick={prevMonth}>‹</button>
        <span className="calendar-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" className="calendar-nav-btn" onClick={nextMonth}>›</button>
      </div>
      <div className="calendar-weekdays">
        {DOW_LABELS.map(d => <span key={d} className="calendar-weekday">{d}</span>)}
      </div>
      <div className="calendar-days">
        {Array.from({ length: firstDow }, (_, i) => (
          <span key={`e${i}`} className="calendar-day calendar-day--empty" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const dateObj  = new Date(viewYear, viewMonth, day);
          const isPast   = dateObj < minDateObj;
          const isSelected = value === dateStr;
          const isToday = dateObj.toDateString() === todayObj.toDateString();
          return (
            <button
              key={day}
              type="button"
              disabled={isPast}
              onClick={() => onChange(dateStr)}
              className={[
                'calendar-day',
                isPast      ? 'calendar-day--past'     : '',
                isSelected  ? 'calendar-day--selected'  : '',
                isToday     ? 'calendar-day--today'      : '',
              ].filter(Boolean).join(' ')}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Step wrapper ────────────────────────────────────────────────────────── */
function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="public-step">
      <div className="public-step-header">
        <div className="public-step-num">{num}</div>
        <span className="public-step-title">{title}</span>
      </div>
      <div className="public-step-body">{children}</div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function PublicPage() {
  const { slug } = useParams<{ slug: string }>();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Passo 1 — seleção múltipla de serviços
  const [servicosIds, setServicosIds] = useState<number[]>([]);
  const [step1Confirmado, setStep1Confirmado] = useState(false);

  // Passo 2 (condicional) — profissional
  // null = nenhum selecionado; undefined = passo suprimido
  const [profissionalId, setProfissionalId] = useState<number | null | undefined>(undefined);

  // Passo 3 — data e slots
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [slots, setSlots] = useState<SlotDisponivel[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotSelecionado, setSlotSelecionado] = useState('');
  const [diaClosed, setDiaClosed] = useState(false);

  // Passo 4 — dados pessoais
  const [nomeCliente, setNomeCliente] = useState('');
  const [whatsappCliente, setWhatsappCliente] = useState('');

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      getEmpresaPublica(slug),
      listServicosPublicos(slug),
      listProfissionaisPublicos(slug),
    ])
      .then(([emp, svcs, profs]) => {
        setEmpresa(emp);
        setServicos(svcs);
        setProfissionais(profs);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!slug || !dataSelecionada || !step1Confirmado) {
      setSlots([]);
      setSlotSelecionado('');
      setLoadingSlots(false);
      setDiaClosed(false);
      return;
    }
    setLoadingSlots(true);
    setSlotSelecionado('');
    setDiaClosed(false);
    const profId = profissionalId === undefined ? null : profissionalId;
    getHorariosDisponiveis(slug, dataSelecionada, servicosIds, profId)
      .then((r) => {
        setSlots(r.slots);
        setDiaClosed(r.fechado ?? false);
      })
      .catch(() => { setSlots([]); setDiaClosed(false); })
      .finally(() => setLoadingSlots(false));
  }, [slug, dataSelecionada, servicosIds, profissionalId, step1Confirmado]);

  function toggleServico(id: number) {
    setServicosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    // Ao mudar a seleção, desfaz confirmação e limpa passos seguintes
    setStep1Confirmado(false);
    setProfissionalId(undefined);
    setDataSelecionada('');
    setSlots([]);
    setSlotSelecionado('');
    setDiaClosed(false);
  }

  function confirmarServicos() {
    if (servicosIds.length === 0) return;
    setStep1Confirmado(true);

    if (profissionais.length > 1) {
      setProfissionalId(null);
    } else if (profissionais.length === 1) {
      setProfissionalId(profissionais[0].id);
    } else {
      setProfissionalId(undefined);
    }
  }

  function handleSelecionarProfissional(id: number) {
    setProfissionalId(id);
    setDataSelecionada('');
    setSlots([]);
    setSlotSelecionado('');
    setDiaClosed(false);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!slotSelecionado) return;

    const nomeErr = nomeCliente.trim().length < 2 ? 'Informe seu nome (mínimo 2 caracteres).' : '';
    const foneErr = !isValidPhone(whatsappCliente) ? 'Informe um WhatsApp válido com DDD. Ex: (85) 99999-0000.' : '';
    if (nomeErr || foneErr) { setFormError(nomeErr || foneErr); return; }

    setFormError('');
    setSubmitting(true);
    const profId = profissionalId === undefined ? null : profissionalId;
    try {
      await createAgendamentoPublico(slug!, {
        servicos_ids: servicosIds,
        profissional: profId,
        data_hora: slotSelecionado,
        nome_cliente: nomeCliente.trim(),
        whatsapp_cliente: normalizePhone(whatsappCliente),
      });
      setSuccess(true);
    } catch (err: unknown) {
      const respData = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      if (respData?.data_hora) {
        const msg = respData.data_hora;
        setFormError(Array.isArray(msg) ? (msg[0] as string) : String(msg));
      } else if (respData) {
        setFormError(Object.values(respData).flat().join(' '));
      } else {
        setFormError('Erro ao criar agendamento. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSuccess(false);
    setServicosIds([]);
    setStep1Confirmado(false);
    setProfissionalId(undefined);
    setDataSelecionada('');
    setSlots([]);
    setSlotSelecionado('');
    setNomeCliente('');
    setWhatsappCliente('');
    setFormError('');
    setDiaClosed(false);
  }

  if (loading) return <div className="public-loading">Carregando...</div>;
  if (notFound) return (
    <div className="public-not-found">
      <h2>Empresa não encontrada</h2>
      <p>Verifique o link e tente novamente.</p>
    </div>
  );

  if (success) {
    return (
      <div className="public-page">
        <div className="public-success">
          <div className="success-card">
            <CheckCircle size={52} className="success-icon" />
            <h2>Agendamento solicitado!</h2>
            <p>Aguarde a confirmação via WhatsApp.</p>
            <button className="btn btn-primary btn-full" onClick={resetForm} style={{ marginTop: 8 }}>
              Fazer outro agendamento
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Serviços selecionados (em ordem de seleção)
  const servicosSelecionados = servicosIds
    .map((id) => servicos.find((s) => s.id === id))
    .filter(Boolean) as Servico[];
  const duracaoTotal = servicosSelecionados.reduce((acc, s) => acc + s.duracao_min, 0);
  const precoTotal   = servicosSelecionados.reduce((acc, s) => acc + Number(s.preco), 0);

  const mostrarPassoProfissional = step1Confirmado && profissionais.length > 1;
  const passoDataLiberado =
    step1Confirmado && (profissionais.length === 0 || profissionalId !== null);
  const profAtual = profissionais.find((p) => p.id === profissionalId);
  const numData  = profissionais.length > 1 ? 3 : 2;
  const numDados = profissionais.length > 1 ? 4 : 3;

  // Progress bar state
  const progressSteps: ProgressStep[] = [
    { label: 'Serviços', state: step1Confirmado ? 'done' : 'current' },
    ...(profissionais.length > 1
      ? [{
          label: 'Profissional',
          state: (!step1Confirmado ? 'pending' : profissionalId !== null ? 'done' : 'current') as ProgressStep['state'],
        }]
      : []),
    {
      label: 'Data e hora',
      state: (slotSelecionado ? 'done' : passoDataLiberado ? 'current' : 'pending') as ProgressStep['state'],
    },
    {
      label: 'Seus dados',
      state: (slotSelecionado ? 'current' : 'pending') as ProgressStep['state'],
    },
  ];

  function labelDia(dateStr: string) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const diaSemana = DIAS_SEMANA[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
    return `${diaSemana}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="public-header-content">
          <h1>{empresa?.nome_fantasia}</h1>
          <p className="public-header-sub">Agende seu horário online</p>
          <a
            href={`https://wa.me/${empresa?.whatsapp_contato}`}
            className="whatsapp-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={15} />
            {empresa?.whatsapp_contato}
          </a>
        </div>
      </header>

      <ProgressBar steps={progressSteps} />

      <div className="public-body">
        {/* Passo 1 — Serviços (multi-select) */}
        <Step num={1} title="Escolha os serviços">
          <div className="service-cards">
            {servicos.map((s) => {
              const selecionado = servicosIds.includes(s.id);
              return (
                <div
                  key={s.id}
                  className={`service-card${selecionado ? ' selected' : ''}`}
                  onClick={() => toggleServico(s.id)}
                >
                  <div className="service-card-info">
                    <p className="service-name">{s.nome}</p>
                    {s.descricao && <p className="service-desc">{s.descricao}</p>}
                    <p className="service-detail">{s.duracao_min} min</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span className="service-price">{fmtBRL(Number(s.preco))}</span>
                    {selecionado && (
                      <span className="service-check-badge">
                        <Check size={12} /> Selecionado
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumo da seleção + botão Continuar */}
          {servicosIds.length > 0 && (
            <div className="service-selection-summary">
              <div className="service-selection-info">
                <span className="service-selection-count">
                  {servicosIds.length} {servicosIds.length === 1 ? 'serviço' : 'serviços'}
                </span>
                <span className="service-selection-details">
                  {duracaoTotal} min &bull; {fmtBRL(precoTotal)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={confirmarServicos}
              >
                Continuar →
              </button>
            </div>
          )}
        </Step>

        {/* Passo 2 (condicional) — Profissional */}
        {mostrarPassoProfissional && (
          <Step num={2} title="Escolha o profissional">
            <div className="profissional-cards">
              {profissionais.map((p) => (
                <div
                  key={p.id}
                  className={`profissional-card${profissionalId === p.id ? ' selected' : ''}`}
                  onClick={() => handleSelecionarProfissional(p.id)}
                >
                  <div className="profissional-avatar">{initials(p.nome)}</div>
                  <div>
                    <p className="profissional-nome">{p.nome}</p>
                    {p.especialidade && (
                      <p className="profissional-especialidade">{p.especialidade}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Step>
        )}

        {/* Passo de data e horário */}
        {passoDataLiberado && (
          <Step num={numData} title="Escolha a data e horário">
            <CalendarPicker
              value={dataSelecionada}
              onChange={setDataSelecionada}
              min={hoje()}
            />

            {dataSelecionada && (
              <>
                <h3 className="slot-day-label">{labelDia(dataSelecionada)}</h3>
                {loadingSlots ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {[0,1,2,3,4,5].map((i) => (
                      <div key={i} className="skeleton" style={{ width: 72, height: 40, borderRadius: 8 }} />
                    ))}
                  </div>
                ) : diaClosed ? (
                  <div className="slot-closed">
                    <p>
                      <strong>{empresa?.nome_fantasia}</strong> não atende em{' '}
                      <strong>{labelDia(dataSelecionada)}</strong>.
                    </p>
                    <p>Por favor, escolha outra data disponível para agendar.</p>
                  </div>
                ) : slots.length === 0 ? (
                  <p className="slot-empty">Nenhum horário disponível neste dia.</p>
                ) : (
                  <div className="slot-grid">
                    {slots.map((slot) => (
                      <button
                        key={slot.datetime}
                        type="button"
                        className={`slot-btn${!slot.disponivel ? ' slot-btn--ocupado' : ''}${slotSelecionado === slot.datetime ? ' slot-btn--selected' : ''}`}
                        disabled={!slot.disponivel}
                        onClick={() => setSlotSelecionado(slot.datetime)}
                      >
                        {slot.hora}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Step>
        )}

        {/* Passo final — Dados pessoais */}
        {slotSelecionado && (
          <Step num={numDados} title="Seus dados">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="booking-summary">
                {servicosSelecionados.map((s) => (
                  <div key={s.id} className="booking-summary-item">
                    ✂️ <strong>{s.nome}</strong>{' '}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
                      {s.duracao_min} min
                    </span>
                  </div>
                ))}
                {profAtual && (
                  <div className="booking-summary-item">
                    👤 {profAtual.nome}
                  </div>
                )}
                <div className="booking-summary-item">
                  📅 {labelDia(dataSelecionada)} às{' '}
                  {slots.find((s) => s.datetime === slotSelecionado)?.hora}
                </div>
                <div className="booking-summary-item">
                  💰 <strong>{fmtBRL(precoTotal)}</strong>
                  {servicosSelecionados.length > 1 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85em', marginLeft: 4 }}>
                      ({duracaoTotal} min no total)
                    </span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Seu nome</label>
                <input
                  value={nomeCliente}
                  onChange={(e) => setNomeCliente(e.target.value)}
                  required
                  placeholder="Como você se chama?"
                />
              </div>
              <div className="form-group">
                <label>WhatsApp</label>
                <input
                  value={whatsappCliente}
                  onChange={(e) => setWhatsappCliente(formatPhone(e.target.value))}
                  required
                  placeholder="(85) 99999-0000"
                  inputMode="numeric"
                />
              </div>

              {formError && <p className="form-error">{formError}</p>}

              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={submitting}
              >
                {submitting && <span className="btn-spinner" />}
                {submitting ? 'Agendando...' : 'Confirmar agendamento'}
              </button>
            </form>
          </Step>
        )}

      </div>
    </div>
  );
}
