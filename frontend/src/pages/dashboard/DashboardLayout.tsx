import { useState, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Calendar, Scissors, Clock, LogOut,
  ExternalLink, Copy, Check, TrendingUp,
  Sun, Moon, CalendarDays, Users,
} from 'lucide-react';

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
      title="Copiar link de agendamento"
    >
      <Copy className="icon-default" size={11} />
      <Check className="icon-copied" size={11} />
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  );
}

const NAV_ITEMS = [
  { to: '/dashboard',                 end: true,  icon: Calendar,   label: 'Agendamentos' },
  { to: '/dashboard/servicos',        end: false, icon: Scissors,   label: 'Serviços' },
  { to: '/dashboard/profissionais',   end: false, icon: Users,      label: 'Profissionais' },
  { to: '/dashboard/horarios',        end: false, icon: Clock,      label: 'Horários' },
  { to: '/dashboard/financeiro',      end: false, icon: TrendingUp, label: 'Financeiro' },
];

export function DashboardLayout() {
  const { empresa, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="dashboard">
      {/* ── Sidebar (desktop) ─────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <CalendarDays size={18} />
          </div>
          <div className="sidebar-company-info">
            <p className="sidebar-company">{empresa?.nome_fantasia}</p>
            <a
              href={`/${empresa?.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-slug"
            >
              /{empresa?.slug} <ExternalLink size={10} />
            </a>
            {empresa?.slug && <CopyLinkButton slug={empresa.slug} />}
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Menu</span>
          {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Alternar tema">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            {theme === 'light' ? 'Modo escuro' : 'Modo claro'}
          </button>
          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* ── Bottom nav (mobile) ───────────────────────────────────────────── */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <button className="mobile-nav-item" onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          Tema
        </button>
      </nav>
    </div>
  );
}
