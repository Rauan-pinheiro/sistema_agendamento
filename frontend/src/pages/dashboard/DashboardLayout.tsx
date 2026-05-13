import { useState, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar, Scissors, Clock, LogOut,
  ExternalLink, Copy, Check, TrendingUp,
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
    }).catch(() => {
      // falha silenciosa — não manipular o DOM fora do React
    });
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

export function DashboardLayout() {
  const { empresa, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-icon">📅</span>
          <div className="sidebar-company-info">
            <p className="sidebar-company">{empresa?.nome_fantasia}</p>
            <a
              href={`/${empresa?.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-slug"
            >
              /{empresa?.slug} <ExternalLink size={11} />
            </a>
            {empresa?.slug && <CopyLinkButton slug={empresa.slug} />}
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            end
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Calendar size={17} />
            Agendamentos
          </NavLink>
          <NavLink
            to="/dashboard/servicos"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Scissors size={17} />
            Serviços
          </NavLink>
          <NavLink
            to="/dashboard/horarios"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Clock size={17} />
            Horários
          </NavLink>
          <NavLink
            to="/dashboard/financeiro"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <TrendingUp size={17} />
            Financeiro
          </NavLink>
        </nav>

        <button className="sidebar-logout" onClick={handleLogout}>
          <LogOut size={15} /> Sair
        </button>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
