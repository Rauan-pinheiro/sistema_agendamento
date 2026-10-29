import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '../../../components/ui';
import type { Agendamento, Profissional } from '../../../types';
import { DIAS_CURTOS, corDoServico, hora, isoLocal, minutosDoDia, nomesServicos, somarDias } from './util';

const PX_HORA = 64;
const STATUS: Record<string, string> = {
  pendente: 'Aguardando confirmação', confirmado: 'Confirmado', cancelado: 'Cancelado', arquivado: 'Arquivado',
};

interface Coluna { chave: string; titulo: ReactNode; ags: Agendamento[]; hoje?: boolean }

function Evento({ ag, ini, faixa, onAbrir }: {
  ag: Agendamento; ini: number; faixa?: { i: number; n: number }; onAbrir: (ag: Agendamento) => void;
}) {
  const top = ((minutosDoDia(ag.data_hora) - ini * 60) / 60) * PX_HORA;
  const altura = Math.max((ag.duracao_total_min / 60) * PX_HORA - 2, 20);
  const fim = new Date(new Date(ag.data_hora).getTime() + ag.duracao_total_min * 60000).toISOString();
  const passado = new Date(fim) < new Date() && ag.status !== 'cancelado';
  const tam = ag.duracao_total_min < 35 ? ' ev--curto' : ag.duracao_total_min < 55 ? ' ev--medio' : '';
  const estilo = {
    top, height: altura, '--cor': corDoServico(ag.servico),
    ...(faixa && { left: `calc(${(faixa.i / faixa.n) * 100}% + 2px)`, width: `calc(${100 / faixa.n}% - 4px)`, right: 'auto' }),
  } as CSSProperties;
  return (
    <button type="button" className={`ev ev--${ag.status}${passado ? ' ev--passado' : ''}${tam}`} style={estilo}
      onClick={() => onAbrir(ag)}
      aria-label={`${hora(ag.data_hora)} a ${hora(fim)}, ${ag.nome_cliente}, ${nomesServicos(ag)}, ${STATUS[ag.status]}`}>
      <span className="ev-cliente">{ag.nome_cliente}</span>
      <span className="ev-hora num">{hora(ag.data_hora)}–{hora(fim)}</span>
      <span className="ev-servico">{nomesServicos(ag)}</span>
      {ag.status === 'pendente' && <span className="ev-status">Aguardando</span>}
    </button>
  );
}

/** Grade de horários. Dia: uma coluna por profissional. Semana: um dia por coluna, em faixas por profissional. */
export function CalendarioAgenda({ visao, inicio, ags, profissionais, onAbrir }: {
  visao: 'dia' | 'semana';
  inicio: Date;
  ags: Agendamento[];
  profissionais: Profissional[];
  onAbrir: (ag: Agendamento) => void;
}) {
  const hojeIso = isoLocal(new Date());
  const pros = profissionais.filter((p) => p.ativo || ags.some((a) => a.profissional === p.id));
  const semPro = ags.some((a) => !a.profissional || !pros.some((p) => p.id === a.profissional));
  const faixas = pros.length + (semPro ? 1 : 0) || 1;
  const faixaDe = (a: Agendamento) => {
    const i = pros.findIndex((p) => p.id === a.profissional);
    return i < 0 ? pros.length : i;
  };

  // Horas visíveis: 8h–20h, ampliando se houver horários fora disso
  let ini = 8;
  let fim = 20;
  for (const a of ags) {
    const m = minutosDoDia(a.data_hora);
    ini = Math.min(ini, Math.floor(m / 60));
    fim = Math.max(fim, Math.ceil((m + a.duracao_total_min) / 60));
  }

  let colunas: Coluna[];
  if (visao === 'dia') {
    colunas = pros.map((p) => {
      const lista = ags.filter((a) => a.profissional === p.id);
      return {
        chave: `p${p.id}`, ags: lista,
        titulo: <><Avatar nome={p.nome} foto={p.foto_url} tamanho={28} /><span><b>{p.nome.split(' ')[0]}</b><small>{lista.filter((a) => a.status !== 'cancelado').length} horários</small></span></>,
      };
    });
    if (semPro || colunas.length === 0) {
      const lista = ags.filter((a) => faixaDe(a) === pros.length);
      colunas.push({ chave: 'sem', ags: lista, titulo: <><Avatar nome="?" neutro tamanho={28} /><span><b>Sem preferência</b><small>{lista.length} horários</small></span></> });
    }
  } else {
    colunas = Array.from({ length: 7 }, (_, i) => {
      const d = somarDias(inicio, i);
      const iso = isoLocal(d);
      return {
        chave: iso, hoje: iso === hojeIso, ags: ags.filter((a) => isoLocal(new Date(a.data_hora)) === iso),
        titulo: <span className="cal-dia-rot"><b>{DIAS_CURTOS[d.getDay()]} {d.getDate()}</b></span>,
      };
    });
  }

  const horas = Array.from({ length: fim - ini - 1 }, (_, i) => ini + i + 1);
  const agora = new Date();
  const mostraAgora = visao === 'dia' ? isoLocal(inicio) === hojeIso : colunas.some((c) => c.hoje);
  const topoAgora = ((agora.getHours() * 60 + agora.getMinutes() - ini * 60) / 60) * PX_HORA;
  const estiloCal = { '--cols': colunas.length, '--px-hora': `${PX_HORA}px` } as CSSProperties;

  return (
    <div className="cal-bloco">
      <div className="cal-rolagem" tabIndex={0} role="region" aria-label={visao === 'dia' ? 'Agenda do dia por profissional' : 'Agenda da semana'}>
        <div className={`cal cal--${visao}`} style={estiloCal}>
          <div className="cal-cab">
            <div />
            {colunas.map((c) => <div key={c.chave} className={`cal-pro${c.hoje ? ' cal-pro--hoje' : ''}`}>{c.titulo}</div>)}
          </div>
          <div className="cal-corpo" style={{ height: (fim - ini) * PX_HORA }}>
            <div className="cal-horas" aria-hidden>
              {horas.map((h) => <span key={h} style={{ top: (h - ini) * PX_HORA }}>{String(h).padStart(2, '0')}:00</span>)}
            </div>
            {colunas.map((c) => (
              <div key={c.chave} className={`cal-col${c.hoje ? ' cal-col--hoje' : ''}`}>
                {c.ags.map((a) => (
                  <Evento key={a.id} ag={a} ini={ini} onAbrir={onAbrir}
                    faixa={visao === 'semana' && faixas > 1 ? { i: faixaDe(a), n: faixas } : undefined} />
                ))}
              </div>
            ))}
            {mostraAgora && topoAgora > 0 && topoAgora < (fim - ini) * PX_HORA && (
              <div className="cal-agora" style={{ top: topoAgora }} aria-hidden><span>{hora(agora.toISOString())}</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
