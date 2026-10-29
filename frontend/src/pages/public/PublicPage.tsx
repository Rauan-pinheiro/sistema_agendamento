import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarX2, Check, CloudOff, PauseCircle, Scissors, SearchX } from 'lucide-react';
import { createAgendamentoPublico, getHorariosDisponiveis, getPaginaPublica } from '../../api/public';
import { Avatar, Campo, ChipHorario, EstadoVazio, Skeleton } from '../../components/ui';
import { useCorEmpresa } from '../../hooks/useCorEmpresa';
import type { Empresa, ProfissionalPublico, ServicoPublico, SlotDisponivel } from '../../types';
import { formatPhone, isValidPhone, normalizePhone } from '../../utils/phone';
import { CalendarPicker } from './CalendarPicker';
import { CapaEmpresa } from './CapaEmpresa';
import { CartaoServico } from './CartaoServico';
import { ResumoVisita } from './ResumoVisita';
import { ServicoDetalhes } from './ServicoDetalhes';
import { DIAS_CURTOS, deIso, fmtBRL, fmtDuracao, fotoDoServico, isoLocal, labelDia, turno } from './util';

const DIAS_NA_FAIXA = 14;

type Consulta = { chave: string; slots: SlotDisponivel[]; fechado: boolean; erro: boolean };
type ErroPagina = 'nao-encontrada' | 'suspensa' | 'rede';

/* ── Estados de página inteira ───────────────────────────────────────────── */
function Carregando() {
  return (
    <div className="sup-vitrine pub-pagina" aria-busy="true">
      <span className="sr-only" role="status">Carregando…</span>
      <div className="capa capa--esqueleto"><Skeleton altura="100%" /></div>
      <div className="pub-corpo">
        <div className="cartoes">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} altura={240} className="esqueleto-cartao" />)}
        </div>
      </div>
    </div>
  );
}

function PaginaErro({ tipo, onTentar }: { tipo: ErroPagina; onTentar: () => void }) {
  const conteudo = {
    'nao-encontrada': { icone: SearchX, titulo: 'Página não encontrada', texto: 'Confira se o link está completo ou peça o link certo para a empresa.' },
    suspensa: { icone: PauseCircle, titulo: 'Agendamento online indisponível', texto: 'Esta empresa pausou o agendamento online por enquanto. Fale com ela diretamente para marcar seu horário.' },
    rede: { icone: CloudOff, titulo: 'Não foi possível carregar', texto: 'Confira sua conexão com a internet e tente de novo.' },
  }[tipo];
  return (
    <main className="sup-vitrine pub-pagina pub-estado">
      <EstadoVazio icone={conteudo.icone} titulo={conteudo.titulo} nivel={2}
        acao={tipo === 'rede' && <button type="button" className="btn btn-primary" onClick={onTentar}>Tentar de novo</button>}>
        {conteudo.texto}
      </EstadoVazio>
    </main>
  );
}

/* ── Página ──────────────────────────────────────────────────────────────── */
export function PublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const hoje = isoLocal(new Date());

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [servicos, setServicos] = useState<ServicoPublico[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalPublico[]>([]);
  const [erro, setErro] = useState<ErroPagina | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [servicosIds, setServicosIds] = useState<number[]>([]);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [profEscolhido, setProfEscolhido] = useState<number | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState(hoje);
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

  useCorEmpresa(empresa?.cor_destaque);

  useEffect(() => {
    if (!slug) return;
    let vivo = true;
    getPaginaPublica(slug)
      .then((p) => {
        if (!vivo) return;
        setEmpresa(p.empresa); setServicos(p.servicos); setProfissionais(p.profissionais); setErro(null);
      })
      .catch((e: { response?: { status?: number } }) => {
        if (!vivo) return;
        const st = e?.response?.status;
        setErro(st === 404 ? 'nao-encontrada' : st === 410 ? 'suspensa' : 'rede');
      });
    return () => { vivo = false; };
  }, [slug, tentativa]);

  // Um profissional só: escolhido automaticamente; vários: a pessoa escolhe
  const profissionalId = profissionais.length === 1 ? profissionais[0].id : profEscolhido;
  const precisaProfissional = profissionais.length > 1;
  const dataLiberada = servicosIds.length > 0 && (!precisaProfissional || profissionalId !== null);

  // Horários: derivados da "chave" da consulta (sem setState síncrono em efeito)
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
  const slotAtual = slots.find((s) => s.datetime === slotSelecionado);
  const profAtual = profissionais.find((p) => p.id === profissionalId);

  // Vitrine com foto quando a maioria dos serviços tem foto; senão, lista compacta (empresa sem fotos)
  const comFoto = servicos.filter((s) => fotoDoServico(s)).length;
  const modoCartao = comFoto > 0 && comFoto * 2 >= servicos.length ? 'foto' : 'compacto';

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

  const rolar = (ref: RefObject<HTMLElement | null>) =>
    requestAnimationFrame(() => ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));

  function toggleServico(id: number) {
    setServicosIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSlotSelecionado('');
  }
  function escolherProfissional(id: number) {
    setProfEscolhido(id);
    setSlotSelecionado('');
    rolar(quandoRef);
  }
  function escolherData(iso: string) {
    setDataSelecionada(iso);
    setMostrarCalendario(false);
    setSlotSelecionado('');
  }
  function escolherSlot(e: MouseEvent<HTMLButtonElement>) {
    setSlotSelecionado(e.currentTarget.dataset.dt ?? '');
    setFormError('');
    rolar(dadosRef);
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
      if (dados?.data_hora) { setSlotSelecionado(''); setRecarga((n) => n + 1); rolar(quandoRef); } // horário tomado
    } finally {
      setSubmitting(false);
    }
  }

  function recomecar() {
    setConfirmado(null);
    setServicosIds([]);
    setProfEscolhido(null);
    setDataSelecionada(hoje);
    setSlotSelecionado('');
    setFormError('');
  }

  if (erro) return <PaginaErro tipo={erro} onTentar={() => { setErro(null); setTentativa((n) => n + 1); }} />;
  if (!empresa) return <Carregando />;

  if (confirmado) {
    const duracao = selecionados.reduce((a, s) => a + s.duracao_min, 0);
    const total = selecionados.reduce((a, s) => a + Number(s.preco), 0);
    return (
      <main className="sup-vitrine pub-pagina pub-estado">
        <div className="pub-sucesso">
          <span className="pub-sucesso-icone" aria-hidden><Check size={28} strokeWidth={3} /></span>
          <h1>Pedido de agendamento enviado</h1>
          <div className="pub-sucesso-detalhe">
            <strong>{labelDia(confirmado.data)}, {confirmado.hora}</strong>
            <span>{selecionados.map((s) => s.nome).join(' + ')}{profAtual ? `, com ${profAtual.nome}` : ''}</span>
            <span className="text-muted">{fmtBRL(total)}, cerca de {fmtDuracao(duracao)}</span>
          </div>
          <p className="text-muted">{empresa.nome_fantasia} vai confirmar pelo WhatsApp {formatPhone(whatsappCliente)}.</p>
          <button type="button" className="btn btn-secondary btn-full" onClick={recomecar}>Fazer outro agendamento</button>
        </div>
      </main>
    );
  }

  const acao = !dataLiberada
    ? { rotulo: 'Escolha o profissional', tipo: 'button' as const, desabilitado: true, carregando: false }
    : !slotSelecionado
      ? { rotulo: 'Escolher horário', tipo: 'button' as const, desabilitado: false, carregando: false, onClick: () => rolar(quandoRef) }
      : { rotulo: submitting ? 'Agendando…' : 'Agendar', tipo: 'submit' as const, desabilitado: submitting, carregando: submitting };

  return (
    <div className="sup-vitrine pub-pagina">
      <CapaEmpresa empresa={empresa} />

      <div className="pub-corpo">
        <main className="pub-principal">
          <section className="secao" aria-labelledby="titulo-servicos">
            <div className="secao-cab">
              <h2 id="titulo-servicos">Serviços</h2>
              {servicos.length > 1 && <span>Escolha um ou mais</span>}
            </div>
            {servicos.length === 0 ? (
              <EstadoVazio icone={Scissors} titulo="Ainda sem serviços online">
                {empresa.nome_fantasia} ainda não cadastrou serviços para agendamento online. Fale pelo WhatsApp para marcar.
              </EstadoVazio>
            ) : (
              <div className={modoCartao === 'foto' ? 'cartoes' : 'cartoes cartoes--compactos'}>
                {servicos.map((s) => (
                  <CartaoServico key={s.id} servico={s} modo={modoCartao}
                    selecionado={servicosIds.includes(s.id)}
                    onToggle={() => toggleServico(s.id)} onVerMais={() => setDetalheId(s.id)} />
                ))}
              </div>
            )}
          </section>

          {servicosIds.length > 0 && precisaProfissional && (
            <section className="secao" aria-labelledby="titulo-prof">
              <div className="secao-cab"><h2 id="titulo-prof">Com quem?</h2></div>
              <div className="equipe">
                {profissionais.map((p) => (
                  <button key={p.id} type="button" className="membro" aria-pressed={profissionalId === p.id}
                    onClick={() => escolherProfissional(p.id)}>
                    <Avatar nome={p.nome} foto={p.foto_url} tamanho={64} />
                    <b>{p.nome}</b>
                    {p.especialidade && <small>{p.especialidade}</small>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {dataLiberada && (
            <section className="secao" aria-labelledby="titulo-quando" ref={quandoRef}>
              <div className="secao-cab">
                <h2 id="titulo-quando">Quando?</h2>
                {profAtual && precisaProfissional && <span>Livres de {profAtual.nome.split(' ')[0]}</span>}
              </div>
              <div className="dias" role="group" aria-label="Próximos dias">
                {proximosDias.map((d) => {
                  const iso = isoLocal(d);
                  return (
                    <button key={iso} type="button" className="dia" aria-pressed={dataSelecionada === iso}
                      aria-label={labelDia(iso)} onClick={() => escolherData(iso)}>
                      <small>{iso === hoje ? 'Hoje' : DIAS_CURTOS[d.getDay()]}</small>
                      <b>{d.getDate()}</b>
                    </button>
                  );
                })}
                <button type="button" className="dia dia--mais" aria-pressed={!!dataForaDaFaixa || mostrarCalendario}
                  aria-expanded={mostrarCalendario} onClick={() => setMostrarCalendario((v) => !v)}>
                  {dataForaDaFaixa ? `${deIso(dataSelecionada).getDate()}/${deIso(dataSelecionada).getMonth() + 1}` : 'Outra data'}
                </button>
              </div>
              {mostrarCalendario && <CalendarPicker value={dataSelecionada} onChange={escolherData} min={hoje} />}

              {/* Horário tomado por outra pessoa: o formulário some junto com o horário, então o aviso fica aqui */}
              {formError && !slotSelecionado && <p className="form-error" role="alert">{formError}</p>}

              <div className="turnos" aria-live="polite" aria-busy={carregandoSlots}>
                <p className="turnos-dia">{labelDia(dataSelecionada)}</p>
                {carregandoSlots ? (
                  <div className="slots">
                    {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} largura={76} altura={44} className="esqueleto-slot" />)}
                  </div>
                ) : consultaAtual?.erro ? (
                  <p className="pub-aviso">Não foi possível carregar os horários. Toque no dia de novo para tentar outra vez.</p>
                ) : consultaAtual?.fechado ? (
                  <p className="pub-aviso"><CalendarX2 size={18} aria-hidden /> <span><strong>{empresa.nome_fantasia}</strong> não atende neste dia. Escolha outra data.</span></p>
                ) : slots.every((s) => !s.disponivel) ? (
                  <p className="pub-aviso"><CalendarX2 size={18} aria-hidden /> Não há horários livres neste dia. Escolha outra data.</p>
                ) : (
                  porTurno.map(([nome, lista]) => (
                    <div key={nome} className="turno">
                      <h3>{nome}</h3>
                      <div className="slots">
                        {lista.map((slot) => (
                          <ChipHorario key={slot.datetime} hora={slot.hora} disabled={!slot.disponivel}
                            selecionado={slotSelecionado === slot.datetime} data-dt={slot.datetime} onClick={escolherSlot} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {slotSelecionado && (
            <section className="secao" aria-labelledby="titulo-dados" ref={dadosRef}>
              <div className="secao-cab"><h2 id="titulo-dados">Seus dados</h2></div>
              <form id="form-agendar" className="pub-form" onSubmit={handleSubmit} noValidate>
                <Campo id="pub-nome" rotulo="Seu nome" value={nomeCliente} autoComplete="name" required erro={erroNome}
                  onChange={(e) => { setNomeCliente(e.target.value); setErroNome(''); }} />
                <Campo id="pub-zap" rotulo="WhatsApp" value={whatsappCliente} inputMode="tel" autoComplete="tel-national"
                  placeholder="(85) 98888-7777" required erro={erroFone} dica="A confirmação chega por aqui."
                  onChange={(e) => { setWhatsappCliente(formatPhone(e.target.value)); setErroFone(''); }} />
                {formError && <p className="form-error" role="alert">{formError}</p>}
                <p className="pub-privacidade">
                  Seu nome e WhatsApp são usados por {empresa.nome_fantasia} apenas para este
                  atendimento. <Link to="/privacidade" target="_blank">Política de privacidade</Link>
                </p>
              </form>
            </section>
          )}
        </main>

        <ResumoVisita selecionados={selecionados} profissional={profAtual} data={dataSelecionada}
          hora={slotAtual?.hora} acao={acao} />
      </div>

      <ServicoDetalhes
        servico={servicos.find((x) => x.id === detalheId) ?? null}
        selecionado={detalheId !== null && servicosIds.includes(detalheId)}
        onToggle={() => detalheId !== null && toggleServico(detalheId)}
        onClose={() => setDetalheId(null)}
      />
    </div>
  );
}
