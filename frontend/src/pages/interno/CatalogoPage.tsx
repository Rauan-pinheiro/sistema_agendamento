import { useState } from 'react';
import './catalogo.css';
import { CalendarDays, Moon, Scissors, Sun } from 'lucide-react';
import { Avatar, Badge, Button, Campo, Cartao, ChipHorario, EstadoVazio, Modal, Segmento, Selo, Skeleton } from '../../components/ui';
import { useFeedback } from '../../context/FeedbackContext';
import { useTheme } from '../../context/ThemeContext';
import { useCorEmpresa } from '../../hooks/useCorEmpresa';
import { CORES_SUGERIDAS } from '../../utils/cor';

type Superficie = 'painel' | 'vitrine';

/**
 * Catálogo interno dos componentes-base. Só existe em desenvolvimento
 * (a rota /_catalogo é registrada sob import.meta.env.DEV e some do build).
 */
export function CatalogoPage() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useFeedback();
  const [cor, setCor] = useState(CORES_SUGERIDAS[1]);
  const [sup, setSup] = useState<Superficie>('painel');
  const [hora, setHora] = useState('10:30');
  const [modal, setModal] = useState(false);
  useCorEmpresa(cor);

  return (
    <div className={`catalogo sup-${sup}`}>
      <header className="catalogo-topo">
        <h1>Catálogo de componentes</h1>
        <Segmento rotulo="Superfície" valor={sup} onChange={setSup}
          opcoes={[{ valor: 'painel', texto: 'Painel (A)' }, { valor: 'vitrine', texto: 'Vitrine (B)' }]} />
        <div className="catalogo-cores" role="group" aria-label="Cor da empresa">
          {CORES_SUGERIDAS.map((c) => (
            <button key={c} type="button" aria-pressed={c === cor} aria-label={`Cor ${c}`}
              style={{ background: c }} onClick={() => setCor(c)} />
          ))}
        </div>
        <button type="button" className="btn-icon" onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <div className="catalogo-grade">
        <Cartao titulo="Botões">
          <div className="catalogo-linha">
            <Button>Primário</Button>
            <Button variant="destaque">Cor da empresa</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="ghost">Discreto</Button>
            <Button variant="danger">Excluir</Button>
            <Button variant="whatsapp">WhatsApp</Button>
            <Button loading>Salvando</Button>
            <Button size="sm" variant="secondary">Pequeno</Button>
          </div>
        </Cartao>

        <Cartao titulo="Campos">
          <div className="catalogo-pilha">
            <Campo rotulo="Seu nome" autoComplete="name" />
            <Campo rotulo="WhatsApp" inputMode="tel" placeholder="(85) 98888-7777" dica="A confirmação chega por aqui." />
            <Campo rotulo="E-mail" defaultValue="maria@" erro="Confira o e-mail." />
          </div>
        </Cartao>

        <Cartao titulo="Horários">
          <div className="catalogo-linha">
            {['09:00', '09:30', '10:00', '10:30', '11:00'].map((h) => (
              <ChipHorario key={h} hora={h} selecionado={h === hora} disabled={h === '09:30'} onClick={() => setHora(h)} />
            ))}
          </div>
        </Cartao>

        <Cartao titulo="Selos e avatares">
          <div className="catalogo-linha">
            <Badge status="confirmado" /><Badge status="pendente" /><Badge status="cancelado" />
            <Selo tom="destaque">agora</Selo><Selo tom="perigo">Suspensa</Selo>
          </div>
          <div className="catalogo-linha">
            <Avatar nome="Carla Menezes" tamanho={48} />
            <Avatar nome="Davi Holanda" tamanho={32} />
            <Avatar nome="Qualquer" neutro tamanho={32} />
          </div>
        </Cartao>

        <Cartao titulo="Carregando" aria-busy="true">
          <div className="catalogo-pilha">
            <div className="catalogo-linha"><Skeleton largura={40} altura={40} redondo /><Skeleton largura="60%" /></div>
            <Skeleton altura={56} />
          </div>
        </Cartao>

        <Cartao titulo="Modal e aviso">
          <div className="catalogo-linha">
            <Button variant="secondary" onClick={() => setModal(true)}>Abrir modal</Button>
            <Button variant="secondary" onClick={() => toast('Serviço salvo')}>Mostrar aviso</Button>
            <Button variant="secondary" onClick={() => toast('Não foi possível salvar', 'erro')}>Aviso de erro</Button>
          </div>
        </Cartao>

        <EstadoVazio icone={Scissors} titulo="Cadastre seu primeiro serviço"
          acao={<Button size="sm">Cadastrar serviço</Button>}>
          Seus clientes escolhem o serviço antes do horário. Comece pelo mais pedido.
        </EstadoVazio>
        <EstadoVazio icone={CalendarDays} titulo="Nenhum horário hoje">
          Compartilhe o link da sua página para receber agendamentos.
        </EstadoVazio>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Cancelar horário?" sheet
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Voltar</Button><Button variant="danger" onClick={() => setModal(false)}>Cancelar horário</Button></>}>
        <p className="text-muted">A cliente recebe o aviso pelo WhatsApp.</p>
      </Modal>
    </div>
  );
}
