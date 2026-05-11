import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  getEmpresaPublica,
  listServicosPublicos,
  createAgendamentoPublico,
  getHorariosDisponiveis,
} from '../../api/public';
import type { Empresa, Servico, SlotDisponivel } from '../../types';
import { CheckCircle } from 'lucide-react';

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function hoje(): string {
  return new Date().toISOString().split('T')[0];
}

export function PublicPage() {
  const { slug } = useParams<{ slug: string }>();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Passo 1 — serviço
  const [servicoId, setServicoId] = useState<number | null>(null);

  // Passo 2 — data e slots
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [slots, setSlots] = useState<SlotDisponivel[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotSelecionado, setSlotSelecionado] = useState('');
  const [diaClosed, setDiaClosed] = useState(false);

  // Passo 3 — dados pessoais
  const [nomeCliente, setNomeCliente] = useState('');
  const [whatsappCliente, setWhatsappCliente] = useState('');

  useEffect(() => {
    if (!slug) return;
    Promise.all([getEmpresaPublica(slug), listServicosPublicos(slug)])
      .then(([emp, svcs]) => {
        setEmpresa(emp);
        setServicos(svcs);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Busca slots quando data ou serviço mudam
  useEffect(() => {
    if (!slug || !dataSelecionada) {
      setSlots([]);
      setSlotSelecionado('');
      return;
    }
    setLoadingSlots(true);
    setSlotSelecionado('');
    setDiaClosed(false);
    getHorariosDisponiveis(slug, dataSelecionada, servicoId ?? undefined)
      .then((r) => {
        setSlots(r.slots);
        setDiaClosed(r.fechado ?? false);
      })
      .catch(() => { setSlots([]); setDiaClosed(false); })
      .finally(() => setLoadingSlots(false));
  }, [slug, dataSelecionada, servicoId]);

  function handleSelecionarServico(id: number) {
    setServicoId(id);
    setDataSelecionada('');
    setSlots([]);
    setSlotSelecionado('');
    setDiaClosed(false);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!slotSelecionado) return;
    setFormError('');
    setSubmitting(true);
    try {
      await createAgendamentoPublico(slug!, {
        servico: servicoId!,
        data_hora: slotSelecionado,
        nome_cliente: nomeCliente,
        whatsapp_cliente: whatsappCliente,
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
    setServicoId(null);
    setDataSelecionada('');
    setSlots([]);
    setSlotSelecionado('');
    setNomeCliente('');
    setWhatsappCliente('');
    setFormError('');
    setDiaClosed(false);
  }

  if (loading) return <div className="public-loading">Carregando...</div>;
  if (notFound)
    return (
      <div className="public-not-found">
        <h2>Empresa não encontrada</h2>
        <p>Verifique o link e tente novamente.</p>
      </div>
    );

  if (success) {
    return (
      <div className="public-page">
        <div className="public-success">
          <CheckCircle size={60} className="success-icon" />
          <h2>Agendamento solicitado!</h2>
          <p>Aguarde a confirmação via WhatsApp.</p>
          <button className="btn btn-primary" onClick={resetForm}>
            Fazer outro agendamento
          </button>
        </div>
      </div>
    );
  }

  const servicoAtual = servicos.find((s) => s.id === servicoId);
  const diasComSlots = slots.length > 0;
  const slotsDoDia = slots;

  // Label do dia selecionado para exibição
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
        <h1>{empresa?.nome_fantasia}</h1>
        <a
          href={`https://wa.me/${empresa?.whatsapp_contato}`}
          className="whatsapp-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          💬 {empresa?.whatsapp_contato}
        </a>
      </header>

      <div className="public-body">
        {/* Passo 1 — Escolher serviço */}
        <section className="public-services">
          <h2>1. Escolha o serviço</h2>
          <div className="service-cards">
            {servicos.map((s) => (
              <div
                key={s.id}
                className={`service-card${servicoId === s.id ? ' selected' : ''}`}
                onClick={() => handleSelecionarServico(s.id)}
              >
                <p className="service-name">{s.nome}</p>
                <p className="service-detail">
                  {s.duracao_min} min · R$ {Number(s.preco).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Passo 2 — Escolher data e horário */}
        {servicoId && (
          <section className="public-slot-picker">
            <h2>2. Escolha a data</h2>
            <input
              type="date"
              className="slot-date-input"
              min={hoje()}
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
            />

            {dataSelecionada && (
              <>
                <h3 className="slot-day-label">{labelDia(dataSelecionada)}</h3>
                {loadingSlots ? (
                  <p className="slot-loading">Carregando horários...</p>
                ) : diaClosed ? (
                  <p className="slot-closed">Não atendemos neste dia. Escolha outra data.</p>
                ) : !diasComSlots ? (
                  <p className="slot-empty">Nenhum horário disponível neste dia.</p>
                ) : (
                  <div className="slot-grid">
                    {slotsDoDia.map((slot) => (
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
          </section>
        )}

        {/* Passo 3 — Dados pessoais e confirmação */}
        {slotSelecionado && (
          <form className="public-form" onSubmit={handleSubmit}>
            <h2>3. Seus dados</h2>

            <div className="booking-summary">
              <span>🪒 {servicoAtual?.nome}</span>
              <span>📅 {labelDia(dataSelecionada)} às {slots.find(s => s.datetime === slotSelecionado)?.hora}</span>
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
                onChange={(e) => setWhatsappCliente(e.target.value)}
                required
                placeholder="85999990000"
              />
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={submitting}
            >
              {submitting ? 'Agendando...' : 'Solicitar agendamento'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
