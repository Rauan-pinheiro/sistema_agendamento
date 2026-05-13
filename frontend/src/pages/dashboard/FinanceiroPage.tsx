import { useState, useEffect } from 'react';
import { getFinanceiroResumo } from '../../api/profissionais';
import type { FinanceiroResumo } from '../../types';

function formatarMoeda(valor: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(valor),
  );
}

function formatarMesReferencia(mesRef: string): string {
  const [ano, mes] = mesRef.split('-');
  const nomes = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  return `${nomes[Number(mes) - 1]} de ${ano}`;
}

export function FinanceiroPage() {
  const [resumo, setResumo] = useState<FinanceiroResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    getFinanceiroResumo()
      .then(setResumo)
      .catch(() => setErro('Não foi possível carregar o resumo financeiro.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Financeiro</h2>
      </div>

      {loading && <p className="loading">Carregando...</p>}
      {erro && <p className="form-error">{erro}</p>}

      {resumo && (
        <>
          <p className="financeiro-mes">
            Mês de referência: <strong>{formatarMesReferencia(resumo.mes_referencia)}</strong>
          </p>

          <div className="financeiro-cards">
            <div className="financeiro-card financeiro-card--receita">
              <span className="financeiro-card-label">Receita bruta</span>
              <span className="financeiro-card-value">
                {formatarMoeda(resumo.receita_bruta)}
              </span>
            </div>

            <div className="financeiro-card financeiro-card--confirmados">
              <span className="financeiro-card-label">Agendamentos confirmados</span>
              <span className="financeiro-card-value">
                {resumo.agendamentos_confirmados}
              </span>
            </div>

            <div className="financeiro-card financeiro-card--ticket">
              <span className="financeiro-card-label">Ticket médio</span>
              <span className="financeiro-card-value">
                {formatarMoeda(resumo.ticket_medio)}
              </span>
            </div>
          </div>

          {resumo.agendamentos_confirmados === 0 && (
            <div className="empty-state">
              <p>Nenhum agendamento confirmado neste mês ainda.</p>
              <p className="empty-hint">
                Os indicadores são calculados sobre agendamentos com status{' '}
                <strong>confirmado</strong> no mês corrente.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
