import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar, CalendarDays, Check, Clock, Copy, ExternalLink, LogOut, Menu, Monitor, Moon,
  Scissors, Settings, Sun, TrendingUp, Users,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type PreferenciaTema } from '../../context/ThemeContext';

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
    <button
      type="button"
      className={`sidebar-copy-btn${copied ? ' sidebar-copy-btn--copied' : ''}`}
      onClick={handleClick}
    >
      <Copy className="icon-default" size={14} aria-hidden />
      <Check className="icon-copied" size={14} aria-hidden />
      <span aria-live="polite">{copied ? 'Link copiado' : 'Copiar link'}</span>
    </button>
  );
}

const NAV_ITEMS = [
  { to: '/dashboard',               end: true,  icon: Calendar,   label: 'Agenda',        principal: true },
  { to: '/dashboard/servicos',      end: false, icon: Scissors,   label: 'Serviços',      principal: true },
  { to: '/dashboard/financeiro',    end: false, icon: TrendingUp, label: 'Financeiro',    principal: true },
  { to: '/dashboard/horarios',      end: false, icon: Clock,      label: 'Horários',      principal: true },
  { to: '/dashboard/profissionais', end: false, icon: Users,      label: 'Profissionais', principal: false },
  { to: '/dashboard/configuracoes', end: false, icon: Settings,   label: 'Configurações', principal: false },
];

const OPCOES_TEMA: { valor: PreferenciaTema; rotulo: string; icone: typeof Sun }[] = [
  { valor: 'system', rotulo: 'Usar o do aparelho', icone: Monitor },
  { valor: 'light', rotulo: 'Claro', icone: Sun },
  { valor: 'dark', rotulo: 'Escuro', icone: Moon },
];

function SeletorTema({ onEscolher }: { onEscolher?: () => void }) {
  const { preferencia, definirPreferencia } = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className="menu-mais">
      {OPCOES_TEMA.map(({ valor, rotulo, icone: Icone }) => (
        <button
          key={valor}
          type="button"
          role="radio"
          aria-checked={preferencia === valor}
          className={`theme-toggle-btn${preferencia === valor ? ' nav-link active' : ''}`}
          onClick={() => { definirPreferencia(valor); onEscolher?.(); }}
        >
          <Icone size={18} aria-hidden /> {rotulo}
        </button>
      ))}
    </div>
  );
}

export function DashboardLayout() {
  const { empresa, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [maisAberto, setMaisAberto] = useState(false);
  const [temaAberto, setTemaAberto] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const secundarioAtivo = NAV_ITEMS.some((i) => !i.principal && pathname.startsWith(i.to));

  return (
    <div className="dashboard">
      <a href="#conteudo" className="pular-conteudo">Pular para o conteúdo</a>

      <aside className="sidebar" aria-label="Menu do painel">
        <div className="sidebar-header">
          <div className="sidebar-logo" aria-hidden><CalendarDays size={18} /></div>
          <div className="sidebar-company-info">
            <span className="sidebar-brand">AgendaFácil</span>
            <p className="sidebar-company">{empresa?.nome_fantasia}</p>
            <a href={`/${empresa?.slug}`} target="_blank" rel="noopener noreferrer" className="sidebar-slug">
              Ver minha página <ExternalLink size={12} aria-hidden />
            </a>
            {empresa?.slug && <CopyLinkButton slug={empresa.slug} />}
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Seções">
          {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={18} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button type="button" className="theme-toggle-btn" onClick={() => setTemaAberto(true)} aria-haspopup="dialog">
            <Sun size={18} aria-hidden /> Tema
          </button>
          <button type="button" className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={18} aria-hidden /> Sair
          </button>
        </div>
      </aside>

      <main id="conteudo" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Seções">
        {NAV_ITEMS.filter((i) => i.principal).map(({ to, end, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}>
            <Icon size={22} aria-hidden />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`mobile-nav-item${secundarioAtivo ? ' active' : ''}`}
          onClick={() => setMaisAberto(true)}
          aria-haspopup="dialog"
        >
          <Menu size={22} aria-hidden />
          Mais
        </button>
      </nav>

      <Modal open={maisAberto} onClose={() => setMaisAberto(false)} title={empresa?.nome_fantasia ?? 'Mais'} sheet>
        <div className="menu-mais">
          {NAV_ITEMS.filter((i) => !i.principal).map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setMaisAberto(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={20} aria-hidden /> {label}
            </NavLink>
          ))}
          <a href={`/${empresa?.slug}`} target="_blank" rel="noopener noreferrer" className="nav-link">
            <ExternalLink size={20} aria-hidden /> Ver minha página
          </a>
          {empresa?.slug && <CopyLinkButton slug={empresa.slug} />}
          <div className="menu-mais-separador" />
          <p className="expanded-section-label">Tema</p>
          <SeletorTema />
          <div className="menu-mais-separador" />
          <button type="button" className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={20} aria-hidden /> Sair
          </button>
        </div>
      </Modal>

      <Modal open={temaAberto} onClose={() => setTemaAberto(false)} title="Tema">
        <SeletorTema onEscolher={() => setTemaAberto(false)} />
      </Modal>
    </div>
  );
}
