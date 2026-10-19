import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, ChevronRight, Clock, Images, MessageCircle } from 'lucide-react';
import { createAgendamentoPublico, getHorariosDisponiveis, getPaginaPublica } from '../../api/public';
import type { Empresa, ProfissionalPublico, ServicoPublico, SlotDisponivel } from '../../types';
import { estiloDestaque } from '../../utils/cor';
import { formatPhone, isValidPhone, normalizePhone } from '../../utils/phone';
import { ServicoDetalhes } from './ServicoDetalhes';

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_NA_FAIXA = 14;

/** Data local YYYY-MM-DD (toISOString usa UTC e erraria o dia à noite). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function deIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: valor % 1 ? 2 : 0 });
}
function labelDia(iso: string): string {
  const d = deIso(iso);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}
function initials(nome: string): string {
  return nome.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}
function turno(hora: string): 'Manhã' | 'Tarde' | 'Noite' {
  const h = Number(hora.slice(0, 2));
  return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
}

/* ── Calendário (outra data) ─────────────────────────────────────────────── */
function CalendarPicker({ value, onChange, min }: { value: string; onChange: (d: string) => void; min: string }) {
  const base = value ? deIso(value) : new Date();
  const [ano, setAno] = useState(base.getFullYear());
  const [mes, setMes] = useState(base.getMonth());
  const minimo = deIso(min);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const primeiro = (new Date(ano, mes, 1).getDay() + 6) % 7; // segunda = 0
  const podeVoltar = new Date(ano, mes, 1) > new Date(minimo.getFullYear(), minimo.getMonth(), 1);

  function mudar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  return (
    <div className="calendar-picker">
      <div className="calendar-header">
        <button type="button" className="calendar-nav-btn" onClick={() => mudar(-1)} disabled={!podeVoltar} aria-label="Mês anterior">‹</button>
        <span className="calendar-month-label" aria-live="polite">{MESES[mes]} de {ano}</span>
        <button type="button" className="calendar-nav-btn" onClick={() => mudar(1)} aria-label="Próximo mês">›</button>
      </div>
      <div className="calendar-weekdays" aria-hidden>
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <span key={d} className="calendar-weekday">{d}</span>)}
      </div>
      <div className="calendar-days">
        {Array.from({ length: primeiro }, (_, i) => <span key={`v${i}`} className="calendar-day calendar-day--empty" />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = new Date(ano, mes, i + 1);
          const iso = isoLocal(dia);
          const passado = dia < minimo;
          return (
            <button
              key={iso}
              type="button"
              disabled={passado}
              aria-pressed={value === iso}
              aria-label={labelDia(iso)}
              onClick={() => onChange(iso)}
              className={['calendar-day', passado && 'calendar-day--past', value === iso && 'calendar-day--selected',
                iso === min && 'calendar-day--today'].filter(Boolean).join(' ')}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Consulta = { chave: string; slots: SlotDisponivel[]; fechado: boolean; erro: boolean };

/* ── Página ──────────────────────────────────────────────────────────────── */
export function PublicPage() {
  const { slug } = useParams<{ slug: string }>();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [servicos, setServicos] = useState<ServicoPublico[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [servicosIds, setServicosIds] = useState<number[]>([]);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [profEscolhido, setProfEscolhido] = useState<number | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [slotSelecionado, setSlotSelecionado] = useState('');
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [recarga, setRecarga] = useState(0); // força nova consulta (ex.: horário tomado por outra pessoa)

  const [nomeCliente, setNomeCliente] = useState('');
  const [whatsappCliente, setWhatsappCliente] = useState('');
  const [erroNome, setErroNome] = useState('');
  const [erroFone, setErroFone] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmado, setConfirmado] = useState<{ data: string; hora: string } | null>(null);

  const quandoRef = useRef<HTMLElement>(null);
  const dadosRef = useRef<HTMLElement>(null);
  const hoje = isoLocal(new Date());

  useEffect(() => {
    if (!slug) return;
    getPaginaPublica(slug)
      .then((p) => { setEmpresa(p.empresa); setServicos(p.servicos); setProfissionais(p.profissionais); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Um profissional só: escolhido automaticamente; vários: a pessoa escolhe
  const profissionalId = profissionais.length === 1 ? profissionais[0].id : profEscolhido;
  const precisaProfissional = profissionais.length > 1;
  const dataLiberada = servicosIds.length > 0 && (!precisaProfissional || profissionalId !== null);

  // Horários: derivados da "chave" da consulta — sem setState síncrono em efeito
  const chaveConsulta = dataLiberada && dataSelecionada && slug
    ? `${slug}|${dataSelecionada}|${servicosIds.join(',')}|${profissionalId ?? ''}|${recarga}` : '';
  useEffect(() => {
    if (!chaveConsulta || !slug) return;
    let vivo = true;
    getHorariosDisponiveis(slug, dataSelecionada, servicosIds, profissionalId)
      .then((r) => { if (vivo) setConsulta({ chave: chaveConsulta, slots: r.slots, fechado: !!r.fechado, erro: false }); })
      .catch(() => { if (vivo) setConsulta({ chave: chaveConsulta, slots: [], fechado: false, erro: true }); });
    return () => { vivo = false; };
    // chaveConsulta já resume data, serviços e profissional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveConsulta]);
  const consultaAtual = consulta?.chave === chaveConsulta ? consulta : null;
  const carregandoSlots = !!chaveConsulta && !consultaAtual;
  const slots = useMemo(() => consultaAtual?.slots ?? [], [consultaAtual]);

  const selecionados = useMemo(
    () => servicosIds.map((id) => servicos.find((s) => s.id === id)).filter(Boolean) as ServicoPublico[],
    [servicosIds, servicos],
  );
  const duracaoTotal = selecionados.reduce((a, s) => a + s.duracao_min, 0);
  const precoTotal = selecionados.reduce((a, s) => a + Number(s.preco), 0);
  const slotAtual = slots.find((s) => s.datetime === slotSelecionado);
  const profAtual = profissionais.find((p) => p.id === profissionalId);

  const porTurno = useMemo(() => {
    const grupos: Record<string, SlotDisponivel[]> = {};
    for (const s of slots) (grupos[turno(s.hora)] ??= []).push(s);
    return Object.entries(grupos);
  }, [slots]);

  const proximosDias = useMemo(() => Array.from({ length: DIAS_NA_FAIXA }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  }), []);
  const dataForaDaFaixa = dataSelecionada && !proximosDias.some((d) => isoLocal(d) === dataSelecionada);

  function limparAgenda() {
    setSlotSelecionado('');
  }
  function toggleServico(id: number) {
    setServicosIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    limparAgenda();
  }
  function escolherProfissional(id: number) {
    setProfEscolhido(id);
    limparAgenda();
  }
  function escolherData(iso: string) {
    setDataSelecionada(iso);
    setMostrarCalendario(false);
    limparAgenda();
  }
  function escolherSlot(e: MouseEvent<HTMLButtonElement>) {
    setSlotSelecionado(e.currentTarget.dataset.dt ?? '');
    requestAnimationFrame(() => dadosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slotSelecionado || !slug) return;
    const nErr = nomeCliente.trim().length < 2 ? 'Escreva seu nome (pelo menos 2 letras).' : '';
    const fErr = !isValidPhone(whatsappCliente) ? 'Use DDD + número, como (85) 98888-7777.' : '';
    setErroNome(nErr);
    setErroFone(fErr);
    if (nErr || fErr) return;

    setFormError('');
    setSubmitting(true);
    try {
      await createAgendamentoPublico(slug, {
        servicos_ids: servicosIds,
        profissional: profissionalId,
        data_hora: slotSelecionado,
        nome_cliente: nomeCliente.trim(),
        whatsapp_cliente: normalizePhone(whatsappCliente),
      });
      setConfirmado({ data: dataSelecionada, hora: slotAtual?.hora ?? '' });
      window.scrollTo({ top: 0 });
    } catch (err: unknown) {
      const dados = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const msg = dados?.data_hora ?? (dados ? Object.values(dados).flat()[0] : null);
      setFormError(
        msg ? String(Array.isArray(msg) ? msg[0] : msg)
          : 'Não foi possível concluir o agendamento. Confira sua conexão e tente de novo.',
      );
      if (dados?.data_hora) { setSlotSelecionado(''); setRecarga((n) => n + 1); } // horário tomado: recarrega a grade
    } finally {
      setSubmitting(false);
    }
  }

  function recomecar() {
    setConfirmado(null);
    setServicosIds([]);
    setProfEscolhido(null);
    setDataSelecionada('');
    setSlotSelecionado('');
    setFormError('');
  }

  const estilo = estiloDestaque(empresa?.cor_destaque) as CSSProperties;

  if (loading) return <div className="public-loading" role="status">Carregando…</div>;
  if (notFound) {
    return (
      <div className="public-not-found">
        <h2>Página não encontrada</h2>
        <p>Confira se o link está completo ou peça o link certo para a empresa.</p>
      </div>
    );
  }

  if (confirmado && empresa) {
    return (
      <div className="pub pub-sucesso" style={estilo}>
        <div className="pub-sucesso-card">
          <div className="pub-sucesso-icone" aria-hidden><Check size={28} strokeWidth={3} /></div>
          <h2>Pedido de agendamento enviado</h2>
          <div className="pub-sucesso-detalhe">
            <strong>{labelDia(confirmado.data)}, {confirmado.hora}</strong>
            <span>{selecionados.map((s) => s.nome).join(' + ')}{profAtual ? `, com ${profAtual.nome}` : ''}</span>
            <span className="text-muted">{fmtBRL(precoTotal)}, cerca de {duracaoTotal} min</span>
          </div>
          <p className="text-muted">{empresa.nome_fantasia} vai confirmar pelo WhatsApp {formatPhone(whatsappCliente)}.</p>
          <button type="button" className="btn btn-secondary btn-full" onClick={recomecar}>Fazer outro agendamento</button>
        </div>
      </div>
    );
  }

  const acaoBarra = !dataLiberada || !slotSelecionado
    ? { rotulo: 'Escolher horário', tipo: 'button' as const }
    : { rotulo: submitting ? 'Agendando…' : 'Agendar', tipo: 'submit' as const };

  return (
    <div className="pub" style={estilo}>
      <div className="pub-conteudo">
        <header className="pub-header">
          <p className="pub-header-sub">Agende online e receba a confirmação no WhatsApp</p>
          <h1>{empresa?.nome_fantasia}</h1>
          {empresa?.whatsapp_contato && (
            <a href={`https://wa.me/55${empresa.whatsapp_contato}`} className="pub-whatsapp" target="_blank" rel="noopener noreferrer">
              <MessageCircle size={18} aria-hidden /> {formatPhone(empresa.whatsapp_contato)}
            </a>
          )}
        </header>

        <section className="pub-secao" aria-labelledby="titulo-servicos">
          <h2 id="titulo-servicos">O que você vai fazer?</h2>
          {servicos.length === 0 ? (
            <p className="pub-aviso">Esta empresa ainda não cadastrou serviços para agendamento online.</p>
          ) : (
            <div className="pub-servicos">
              {servicos.map((s) => {
                const marcado = servicosIds.includes(s.id);
                const capa = s.midias.find((m) => m.thumb_url)?.thumb_url;
                const temVerMais = s.midias.length > 0 || s.descricao.length > 90;
                return (
                  <div key={s.id} className="pub-servico service-card">
                    <button
                      type="button"
                      className="pub-servico-marcar"
                      aria-pressed={marcado}
                      aria-label={`${marcado ? 'Remover' : 'Escolher'} ${s.nome}`}
                      onClick={() => toggleServico(s.id)}
                    >
                      {marcado && <Check size={18} strokeWidth={3} aria-hidden />}
                    </button>
                    <div className="pub-servico-info">
                      <button type="button" className="pub-servico-nome service-name" onClick={() => toggleServico(s.id)} tabIndex={-1}>
                        {s.nome}
                      </button>
                      {s.descricao && <p className="pub-servico-desc">{s.descricao}</p>}
                      <p className="pub-servico-meta">
                        <span><Clock size={14} aria-hidden /> {s.duracao_min} min</span>
                        {s.midias.length > 0 && <span><Images size={14} aria-hidden /> {s.midias.length} {s.midias.length === 1 ? 'foto ou vídeo' : 'fotos e vídeos'}</span>}
                      </p>
                      {temVerMais && (
                        <button type="button" className="pub-ver-mais service-ver-mais" onClick={() => setDetalheId(s.id)} aria-haspopup="dialog">
                          Ver mais <ChevronRight size={16} aria-hidden />
                        </button>
                      )}
                    </div>
                    <div className="pub-servico-direita">
                      <span className="pub-servico-preco">{fmtBRL(Number(s.preco))}</span>
                      {capa && <img className="pub-servico-capa" src={capa} alt="" loading="lazy" decoding="async" width={64} height={64} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {servicosIds.length > 0 && precisaProfissional && (
          <section className="pub-secao" aria-labelledby="titulo-prof">
            <h2 id="titulo-prof">Com quem?</h2>
            <div className="pub-profissionais">
              {profissionais.map((p) => (
                <button key={p.id} type="button" className="pub-profissional" aria-pressed={profissionalId === p.id} onClick={() => escolherProfissional(p.id)}>
                  <span className="profissional-avatar" aria-hidden>{initials(p.nome)}</span>
                  <span>
                    <span className="pub-profissional-nome">{p.nome}</span>
                    {p.especialidade && <span className="pub-profissional-esp"><br />{p.especialidade}</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {dataLiberada && (
          <section className="pub-secao" aria-labelledby="titulo-quando" ref={quandoRef}>
            <h2 id="titulo-quando">Quando?</h2>
            <div className="pub-dias" role="group" aria-label="Próximos dias">
              {proximosDias.map((d) => {
                const iso = isoLocal(d);
                return (
                  <button key={iso} type="button" className="pub-dia" aria-pressed={dataSelecionada === iso} aria-label={labelDia(iso)} onClick={() => escolherData(iso)}>
                    <span className="pub-dia-semana">{iso === hoje ? 'hoje' : DIAS_CURTOS[d.getDay()]}</span>
                    <span className="pub-dia-num">{d.getDate()}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className="pub-dia pub-dia--mais"
                aria-pressed={!!dataForaDaFaixa || mostrarCalendario}
                aria-expanded={mostrarCalendario}
                onClick={() => setMostrarCalendario((v) => !v)}
              >
                {dataForaDaFaixa ? `${deIso(dataSelecionada).getDate()}/${deIso(dataSelecionada).getMonth() + 1}` : 'Outra data'}
              </button>
            </div>
            {mostrarCalendario && <CalendarPicker value={dataSelecionada} onChange={escolherData} min={hoje} />}

            {!dataSelecionada ? (
              <p className="pub-secao-dica">Escolha um dia para ver os horários livres.</p>
            ) : (
              <div aria-live="polite" aria-busy={carregandoSlots}>
                <p className="pub-turno">{labelDia(dataSelecionada)}</p>
                {carregandoSlots ? (
                  <div className="pub-horarios">
                    {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}
                  </div>
                ) : consultaAtual?.erro ? (
                  <p className="pub-aviso">Não foi possível carregar os horários. Toque no dia de novo para tentar outra vez.</p>
                ) : consultaAtual?.fechado ? (
                  <p className="pub-aviso"><strong>{empresa?.nome_fantasia}</strong> não atende neste dia. Escolha outra data.</p>
                ) : slots.every((s) => !s.disponivel) ? (
                  <p className="pub-aviso">Os horários deste dia já foram preenchidos. Escolha outra data.</p>
                ) : (
                  porTurno.map(([nome, lista]) => (
                    <div key={nome}>
                      <p className="pub-turno">{nome}</p>
                      <div className="pub-horarios">
                        {lista.map((slot) => (
                          <button
                            key={slot.datetime}
                            type="button"
                            className="pub-horario"
                            disabled={!slot.disponivel}
                            aria-pressed={slotSelecionado === slot.datetime}
                            aria-label={slot.disponivel ? slot.hora : `${slot.hora}, ocupado`}
                            data-dt={slot.datetime}
                            onClick={escolherSlot}
                          >
                            {slot.hora}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        )}

        {slotSelecionado && (
          <section className="pub-secao" aria-labelledby="titulo-dados" ref={dadosRef}>
            <h2 id="titulo-dados">Seus dados</h2>
            <form id="form-agendar" className="pub-form" onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="pub-nome">Seu nome</label>
                <input
                  id="pub-nome"
                  value={nomeCliente}
                  onChange={(e) => { setNomeCliente(e.target.value); setErroNome(''); }}
                  autoComplete="name"
                  aria-invalid={!!erroNome}
                  aria-describedby={erroNome ? 'pub-nome-erro' : undefined}
                  required
                />
                {erroNome && <span id="pub-nome-erro" className="form-error">{erroNome}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="pub-zap">WhatsApp</label>
                <input
                  id="pub-zap"
                  value={whatsappCliente}
                  onChange={(e) => { setWhatsappCliente(formatPhone(e.target.value)); setErroFone(''); }}
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(85) 98888-7777"
                  aria-invalid={!!erroFone}
                  aria-describedby={erroFone ? 'pub-zap-erro' : 'pub-zap-dica'}
                  required
                />
                {erroFone
                  ? <span id="pub-zap-erro" className="form-error">{erroFone}</span>
                  : <span id="pub-zap-dica" className="form-hint">A confirmação chega por aqui.</span>}
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <p className="pub-privacidade">
                Seu nome e WhatsApp são usados por {empresa?.nome_fantasia ?? 'esta empresa'} apenas para este
                atendimento. <Link to="/privacidade" target="_blank">Política de privacidade</Link>
              </p>
            </form>
          </section>
        )}
      </div>

      {selecionados.length > 0 && (
        <div className="pub-barra" role="region" aria-label="Resumo do agendamento">
          <div className="pub-barra-interna">
            <div className="pub-barra-resumo">
              <span className="pub-barra-linha">
                {selecionados.map((s) => s.nome).join(' + ')}
                {slotAtual ? `, ${DIAS_CURTOS[deIso(dataSelecionada).getDay()]} ${deIso(dataSelecionada).getDate()} às ${slotAtual.hora}` : ''}
              </span>
              <span className="pub-barra-total">{fmtBRL(precoTotal)}<small>{duracaoTotal} min</small></span>
            </div>
            {acaoBarra.tipo === 'submit' ? (
              <button type="submit" form="form-agendar" className="btn" disabled={submitting}>
                {submitting && <span className="btn-spinner" aria-hidden />}
                {acaoBarra.rotulo}
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => quandoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                disabled={!dataLiberada}
                title={!dataLiberada ? 'Escolha com quem você quer ser atendido' : undefined}
              >
                {dataLiberada ? acaoBarra.rotulo : 'Escolha o profissional'}
              </button>
            )}
          </div>
        </div>
      )}

      <ServicoDetalhes
        servico={servicos.find((x) => x.id === detalheId) ?? null}
        selecionado={detalheId !== null && servicosIds.includes(detalheId)}
        onToggle={() => detalheId !== null && toggleServico(detalheId)}
        onClose={() => setDetalheId(null)}
      />
    </div>
  );
}
