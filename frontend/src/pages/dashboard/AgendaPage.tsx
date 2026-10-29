import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { listAllProfissionais } from '../../api/profissionais';
import { Segmento, Skeleton } from '../../components/ui';
import type { Agendamento, Profissional } from '../../types';
import { mensagemDeErro } from '../../utils/erros';
import { AgendamentosPage } from './AgendamentosPage';
import { CalendarioAgenda } from './agenda/CalendarioAgenda';
import { DetalheAgendamento } from './agenda/DetalheAgendamento';
import {
  carregarIntervalo, corDoServico, deIso, inicioSemana, isoLocal, somarDias, tituloDia, tituloSemana,
} from './agenda/util';

type Visao = 'dia' | 'semana' | 'lista';
const VISOES = [{ valor: 'dia', texto: 'Dia' }, { valor: 'semana', texto: 'Semana' }, { valor: 'lista', texto: 'Lista' }] as const;

/** Agenda: Dia e Semana em grade (uma coluna por profissional), Lista com filtros por situação. */
export function AgendaPage() {
  const [params, setParams] = useSearchParams();
  const visao = (VISOES.some((v) => v.valor === params.get('visao')) ? params.get('visao') : 'dia') as Visao;
  const data = params.get('data') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('data')!) ? deIso(params.get('data')!) : new Date();
  const inicio = visao === 'semana' ? inicioSemana(data) : new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const chave = `${visao}|${isoLocal(inicio)}`;

  const [estado, setEstado] = useState<{ chave: string; ags: Agendamento[]; erro: string } | null>(null);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [aberto, setAberto] = useState<Agendamento | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => { listAllProfissionais().then(setProfissionais).catch(() => {}); }, []);
  useEffect(() => {
    if (visao === 'lista') return;
    let vivo = true;
    const ini = isoLocal(inicio);
    const fim = isoLocal(somarDias(inicio, visao === 'semana' ? 6 : 0));
    carregarIntervalo(ini, fim)
      .then((ags) => { if (vivo) setEstado({ chave, ags, erro: '' }); })
      .catch((e) => { if (vivo) setEstado({ chave, ags: [], erro: mensagemDeErro(e, 'Não foi possível carregar a agenda.') }); });
    return () => { vivo = false; };
    // chave resume visão e data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, recarga]);

  const ir = useCallback((novo: Partial<{ visao: Visao; data: Date }>) => {
    const p = new URLSearchParams(params);
    if (novo.visao) p.set('visao', novo.visao);
    if (novo.data) p.set('data', isoLocal(novo.data));
    setParams(p, { replace: true });
  }, [params, setParams]);

  const passo = visao === 'semana' ? 7 : 1;
  const atual = estado?.chave === chave ? estado : null;
  const titulo = visao === 'semana' ? tituloSemana(inicio) : visao === 'dia' ? tituloDia(inicio) : 'Todos os agendamentos';
  const servicosNaTela = new Map<number, string>();
  for (const a of atual?.ags ?? []) {
    if (a.servico) servicosNaTela.set(a.servico, a.servicos_info?.[0]?.nome ?? a.servico_nome ?? '');
  }

  return (
    <div className="page agenda-page">
      <div className="agenda-barra">
        <h1 aria-live="polite">{titulo}</h1>
        {visao !== 'lista' && (
          <div className="agenda-nav">
            <button type="button" className="btn-icon" onClick={() => ir({ data: somarDias(inicio, -passo) })}
              aria-label={visao === 'semana' ? 'Semana anterior' : 'Dia anterior'}><ChevronLeft size={18} /></button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ir({ data: new Date() })}>Hoje</button>
            <button type="button" className="btn-icon" onClick={() => ir({ data: somarDias(inicio, passo) })}
              aria-label={visao === 'semana' ? 'Próxima semana' : 'Próximo dia'}><ChevronRight size={18} /></button>
          </div>
        )}
        <div className="agenda-direita">
          <Segmento rotulo="Visão" opcoes={VISOES} valor={visao} onChange={(v) => ir({ visao: v })} />
        </div>
      </div>

      {visao === 'lista' ? (
        <AgendamentosPage embutida />
      ) : atual?.erro ? (
        <p className="form-error" role="alert">{atual.erro} <button type="button" className="btn btn-sm btn-secondary" onClick={() => setRecarga((n) => n + 1)}>Tentar de novo</button></p>
      ) : !atual ? (
        <div aria-busy="true"><span className="sr-only" role="status">Carregando agenda…</span><Skeleton altura={480} className="skeleton-card" /></div>
      ) : (
        <>
          <CalendarioAgenda visao={visao} inicio={inicio} ags={atual.ags} profissionais={profissionais} onAbrir={setAberto} />
          {atual.ags.length === 0 ? (
            <p className="agenda-vazia">Nenhum horário {visao === 'dia' ? 'neste dia' : 'nesta semana'}. Compartilhe o link da sua página para receber agendamentos.</p>
          ) : (
            <ul className="legenda" aria-label="Legenda">
              {[...servicosNaTela].slice(0, 8).map(([id, nome]) => (
                <li key={id}><i style={{ background: corDoServico(id) }} aria-hidden />{nome}</li>
              ))}
              <li><i className="legenda-pendente" aria-hidden />Aguardando confirmação</li>
              <li><i className="legenda-cancelado" aria-hidden />Cancelado</li>
            </ul>
          )}
        </>
      )}

      <DetalheAgendamento ag={aberto} onClose={() => setAberto(null)}
        onAtualizado={(novo) => { setAberto(novo); setRecarga((n) => n + 1); }} />
    </div>
  );
}
