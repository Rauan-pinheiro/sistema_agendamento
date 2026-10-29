import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays, Check, Copy, ExternalLink, House, LogOut, Monitor, Moon, MoreHorizontal,
  Scissors, SlidersHorizontal, Sun, Users, Wallet,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type PreferenciaTema } from '../../context/ThemeContext';
import { useCorEmpresa } from '../../hooks/useCorEmpresa';
import { iniciais } from '../../utils/cor';

function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    const url = `${window.location.origin}/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <button type="button" className={`nav-item nav-item--sec${copied ? ' is-copiado' : ''}`} onClick={handleClick}>
      {copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
      <span aria-live="polite">{copied ? 'Link copiado' : 'Copiar link da página'}</span>
    </button>
  );
}

/** Menu enxuto (Direção A). "Equipe" junta profissionais e horários. */
const NAV_ITEMS = [
  { to: '/dashboard',            end: true,  icon: House,             label: 'Hoje',       aba: true },
  { to: '/dashboard/agenda',     end: false, icon: CalendarDays,      label: 'Agenda',     aba: true },
  { to: '/dashboard/servicos',   end: false, icon: Scissors,          label: 'Serviços',   aba: true },
  { to: '/dashboard/equipe',     end: false, icon: Users,             label: 'Equipe',     aba: false },
  { to: '/dashboard/financeiro', end: false, icon: Wallet,            label: 'Financeiro', aba: false },
  { to: '/dashboard/ajustes',    end: false, icon: SlidersHorizontal, label: 'Ajustes',    aba: false },
];

const OPCOES_TEMA: { valor: PreferenciaTema; rotulo: string; icone: typeof Sun }[] = [
  { valor: 'system', rotulo: 'Do aparelho', icone: Monitor },
  { valor: 'light', rotulo: 'Claro', icone: Sun },
  { valor: 'dark', rotulo: 'Escuro', icone: Moon },
];

function SeletorTema() {
  const { preferencia, definirPreferencia } = useTheme();
  return (
    <div className="segmento seletor-tema" role="radiogroup" aria-label="Tema">
      {OPCOES_TEMA.map(({ valor, rotulo, icone: Icone }) => (
        <button key={valor} type="button" role="radio" aria-checked={preferencia === valor}
          onClick={() => definirPreferencia(valor)} title={rotulo}>
          <Icone size={15} aria-hidden /><span>{rotulo}</span>
        </button>
      ))}
    </div>
  );
}

function MarcaEmpresa({ nome, logo }: { nome: string; logo?: string | null }) {
  return (
    <span className="marca-empresa">
      {logo ? <img src={logo} alt="" width={28} height={28} /> : <span className="marca-sigla" aria-hidden>{iniciais(nome)}</span>}
      <span className="marca-nome">{nome}</span>
    </span>
  );
}

export function DashboardLayout() {
  const { empresa, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [maisAberto, setMaisAberto] = useState(false);
  useCorEmpresa(empresa?.cor_destaque);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const nome = empresa?.nome_fantasia ?? 'Minha empresa';
  const secundarioAtivo = NAV_ITEMS.some((i) => !i.aba && pathname.startsWith(i.to));
  const link = (i: typeof NAV_ITEMS[number], onClick?: () => void) => (
    <NavLink key={i.to} to={i.to} end={i.end} onClick={onClick} className="nav-item">
      <i.icon size={17} aria-hidden /><span>{i.label}</span>
    </NavLink>
  );

  return (
    <div className="dashboard sup-painel">
      <a href="#conteudo" className="pular-conteudo">Pular para o conteúdo</a>

      <aside className="lateral" aria-label="Menu do painel">
        <MarcaEmpresa nome={nome} logo={empresa?.logo_url} />
        <nav className="lateral-nav" aria-label="Seções">{NAV_ITEMS.map((i) => link(i))}</nav>
        <div className="lateral-rodape">
          <a href={`/${empresa?.slug}`} target="_blank" rel="noopener noreferrer" className="nav-item nav-item--sec">
            <ExternalLink size={17} aria-hidden /><span>Ver minha página</span>
          </a>
          {empresa?.slug && <CopyLinkButton slug={empresa.slug} />}
          <SeletorTema />
          <button type="button" className="nav-item nav-item--sec" onClick={handleLogout}>
            <LogOut size={17} aria-hidden /><span>Sair</span>
          </button>
        </div>
      </aside>

      <header className="topo-movel">
        <MarcaEmpresa nome={nome} logo={empresa?.logo_url} />
        <a href={`/${empresa?.slug}`} target="_blank" rel="noopener noreferrer" className="btn-icon" aria-label="Ver minha página">
          <ExternalLink size={18} aria-hidden />
        </a>
      </header>

      <main id="conteudo" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="abas-movel" aria-label="Seções">
        {NAV_ITEMS.filter((i) => i.aba).map((i) => link(i))}
        <button type="button" className={`nav-item${secundarioAtivo ? ' active' : ''}`}
          onClick={() => setMaisAberto(true)} aria-haspopup="dialog">
          <MoreHorizontal size={17} aria-hidden /><span>Mais</span>
        </button>
      </nav>

      <Modal open={maisAberto} onClose={() => setMaisAberto(false)} title={nome} sheet superficie="sup-painel">
        <div className="menu-mais">
          {NAV_ITEMS.filter((i) => !i.aba).map((i) => link(i, () => setMaisAberto(false)))}
          <div className="menu-mais-separador" />
          {empresa?.slug && <CopyLinkButton slug={empresa.slug} />}
          <p className="menu-mais-rotulo">Tema</p>
          <SeletorTema />
          <div className="menu-mais-separador" />
          <button type="button" className="nav-item nav-item--sec" onClick={handleLogout}>
            <LogOut size={17} aria-hidden /><span>Sair</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
