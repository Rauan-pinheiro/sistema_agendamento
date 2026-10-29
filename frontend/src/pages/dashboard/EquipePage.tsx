import { useSearchParams } from 'react-router-dom';
import { Segmento } from '../../components/ui';
import { HorariosPage } from './HorariosPage';
import { ProfissionaisPage } from './ProfissionaisPage';

const ABAS = [{ valor: 'pessoas', texto: 'Profissionais' }, { valor: 'horarios', texto: 'Horários' }] as const;
type Aba = typeof ABAS[number]['valor'];

/** Equipe: profissionais e grade de horários no mesmo lugar. */
export function EquipePage() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get('aba') === 'horarios' ? 'horarios' : 'pessoas';
  return (
    <div className="page equipe-page">
      <div className="page-header">
        <div>
          <h1>Equipe</h1>
          <p className="page-subtitle">Quem atende e em quais horários.</p>
        </div>
        <Segmento rotulo="Seção da equipe" opcoes={ABAS} valor={aba}
          onChange={(v) => setParams(v === 'pessoas' ? {} : { aba: v }, { replace: true })} />
      </div>
      {aba === 'pessoas' ? <ProfissionaisPage /> : <HorariosPage />}
    </div>
  );
}
