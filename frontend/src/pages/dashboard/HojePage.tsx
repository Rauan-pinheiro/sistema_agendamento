import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Check, MessageCircle } from 'lucide-react';
import { listAgendamentos, updateStatus } from '../../api/agendamentos';
import { Cartao, EstadoVazio, Selo, Skeleton } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import type { Agendamento } from '../../types';
import { mensagemDeErro } from '../../utils/erros';
import { buildWhatsappUrl, openWhatsApp } from '../../utils/whatsapp';
import { DetalheAgendamento } from './agenda/DetalheAgendamento';
import {
  DIAS_CURTOS, brl, carregarIntervalo, hora, inicioSemana, isoLocal, nomesServicos, somarDias, tituloDia,
} from './agenda/util';

const ATUALIZAR_MS = 60_000;

type Dados = { semana: Agendamento[]; pendentes: Agendamento[]; totalPendentes: number };

function fimDe(ag: Agendamento): number {
  return new Date(ag.data_hora).getTime() + ag.duracao_total_min * 60000;
}
function quandoRelativo(ag: Agendamento, agora: number): string {
  const ini = new Date(ag.data_hora).getTime();
  if (ini <= agora) return 'agora';
  const min = Math.round((ini - agora) / 60000);
  return min < 60 ? `em ${min} min` : `em ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`;
}

/** Painel "Hoje" (Direção A): o que vem a seguir, o que espera confirmação e como vai a semana. */
export function HojePage() {
  const { empresa } = useAuth();
  const { toast } = useFeedback();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [aberto, setAberto] = useState<Agendamento | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const hoje = new Date();
  const hojeIso = isoLocal(hoje);
  const seg = inicioSemana(hoje);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      carregarIntervalo(isoLocal(seg), isoLocal(somarDias(seg, 6))),
      listAgendamentos({ status: 'pendente', data_inicio: hojeIso, ordem: 'asc', page_size: 6 }),
    ])
      .then(([semana, pend]) => {
        if (!vivo) return;
        setDados({ semana, pendentes: pend.results, totalPendentes: pend.count });
        setErro('');
        setAgora(Date.now());
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar o dia.')); });
    return () => { vivo = false; };
    // seg/hojeIso mudam só na virada do dia; a recarga periódica cobre isso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

  useEffect(() => {
    const t = setInterval(() => setRecarga((n) => n + 1), ATUALIZAR_MS);
    return () => clearInterval(t);
  }, []);

  async function confirmar(ag: Agendamento) {
    try {
      await updateStatus(ag.id, 'confirmado');
      toast(`${ag.nome_cliente} confirmado`);
      setRecarga((n) => n + 1);
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível confirmar.'), 'erro');
    }
  }

  const ativos = (dados?.semana ?? []).filter((a) => a.status !== 'cancelado');
  const doDia = ativos.filter((a) => isoLocal(new Date(a.data_hora)) === hojeIso);
  const aSeguir = doDia.filter((a) => fimDe(a) > agora);
  const feitos = doDia.length - aSeguir.length;
  const previstoHoje = doDia.reduce((t, a) => t + Number(a.preco_total), 0);
  const porDia = Array.from({ length: 7 }, (_, i) => {
    const iso = isoLocal(somarDias(seg, i));
    return { iso, n: ativos.filter((a) => isoLocal(new Date(a.data_hora)) === iso).length };
  });
  const maxDia = Math.max(1, ...porDia.map((d) => d.n));
  const receitaSemana = ativos.reduce((t, a) => t + Number(a.preco_total), 0);

  return (
    <div className="page hoje-page">
      <div className="page-header">
        <div>
          <h1>Hoje</h1>
          <p className="page-subtitle">{tituloDia(hoje)}</p>
        </div>
        <Link to="/dashboard/agenda" className="btn btn-secondary btn-sm"><CalendarDays size={15} aria-hidden /> Ver agenda</Link>
      </div>

      {erro && !dados ? (
        <p className="form-error" role="alert">{erro} <button type="button" className="btn btn-sm btn-secondary" onClick={() => setRecarga((n) => n + 1)}>Tentar de novo</button></p>
      ) : !dados ? (
        <div aria-busy="true" className="hoje-carregando">
          <span className="sr-only" role="status">Carregando…</span>
          <Skeleton altura={68} /><Skeleton altura={320} />
        </div>
      ) : (
        <>
          <dl className="metricas-dia">
            <div><dt>Horários hoje</dt><dd className="num">{doDia.length}</dd></div>
            <div><dt>Previsto hoje</dt><dd className="num">{brl(previstoHoje)}</dd></div>
            <div><dt>A confirmar</dt><dd className="num">{dados.totalPendentes}</dd></div>
            <div><dt>Próximo</dt><dd className="num">{aSeguir[0] ? hora(aSeguir[0].data_hora) : '—'}</dd></div>
          </dl>

          <div className="hoje-grade">
            <Cartao titulo="A seguir" acao={feitos > 0 && <span className="link">{feitos} já {feitos === 1 ? 'atendido' : 'atendidos'} hoje</span>}>
              {aSeguir.length === 0 ? (
                <div className="bloco-vazio">
                  <EstadoVazio icone={CalendarCheck} titulo={doDia.length ? 'Por hoje é só' : 'Nenhum horário hoje'}
                    acao={<Link to="/dashboard/agenda?visao=semana" className="btn btn-secondary btn-sm">Ver a semana</Link>}>
                    {doDia.length ? 'Todos os atendimentos de hoje já passaram.' : 'Compartilhe o link da sua página para receber agendamentos.'}
                  </EstadoVazio>
                </div>
              ) : (
                <ul className="fila">
                  {aSeguir.map((a) => {
                    const rel = quandoRelativo(a, agora);
                    return (
                      <li key={a.id} className={rel === 'agora' ? 'agora' : undefined}>
                        <button type="button" className="fila-abrir" onClick={() => setAberto(a)}>
                          <span className="fila-h num">{hora(a.data_hora)}<small>{rel}</small></span>
                          <span className="fila-quem">
                            <b>{a.nome_cliente}</b>
                            <span>{nomesServicos(a)}{a.profissional_nome ? ` · ${a.profissional_nome}` : ''}</span>
                          </span>
                        </button>
                        <span className="fila-lado">
                          {a.status === 'pendente' ? <Selo tom="aviso">Aguardando</Selo> : rel === 'agora' && <Selo tom="destaque">Agora</Selo>}
                          <button type="button" className="btn-icon" aria-label={`WhatsApp de ${a.nome_cliente}`}
                            onClick={() => openWhatsApp(buildWhatsappUrl(a, empresa?.nome_fantasia ?? ''))}>
                            <MessageCircle size={17} aria-hidden />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Cartao>

            <div className="hoje-lado">
              <Cartao titulo="Esperando sua confirmação"
                acao={dados.totalPendentes > dados.pendentes.length && <Link to="/dashboard/agenda?visao=lista">Ver todos ({dados.totalPendentes})</Link>}>
                {dados.pendentes.length === 0 ? (
                  <p className="bloco-texto"><Check size={16} aria-hidden /> Tudo confirmado.</p>
                ) : (
                  <ul className="pendencias">
                    {dados.pendentes.map((a) => {
                      const d = new Date(a.data_hora);
                      const dia = isoLocal(d) === hojeIso ? 'Hoje' : `${DIAS_CURTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
                      return (
                        <li key={a.id}>
                          <button type="button" className="pendencia-abrir" onClick={() => setAberto(a)}>
                            <b>{a.nome_cliente}</b>
                            <small>{dia}, {hora(a.data_hora)} · {nomesServicos(a)}</small>
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => confirmar(a)}
                            aria-label={`Confirmar ${a.nome_cliente}`}>Confirmar</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Cartao>

              <Cartao titulo="Esta semana">
                <div className="semana">
                  <dl>
                    <div><dt>Agendamentos</dt><dd className="num">{ativos.length}</dd></div>
                    <div><dt>Receita prevista</dt><dd className="num">{brl(receitaSemana)}</dd></div>
                  </dl>
                  <ol className="barras-semana" aria-label="Agendamentos por dia">
                    {porDia.map((d, i) => (
                      <li key={d.iso} className={d.iso === hojeIso ? 'hoje' : undefined}>
                        <span className="num">{d.n}</span>
                        <i style={{ height: `${Math.max(4, (d.n / maxDia) * 64)}px` }} aria-hidden />
                        <span>{DIAS_CURTOS[(i + 1) % 7]}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Cartao>
            </div>
          </div>
        </>
      )}

      <DetalheAgendamento ag={aberto} onClose={() => setAberto(null)}
        onAtualizado={(novo) => { setAberto(novo); setRecarga((n) => n + 1); }} />
    </div>
  );
}
