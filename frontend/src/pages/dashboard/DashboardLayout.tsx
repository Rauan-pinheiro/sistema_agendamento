import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Scissors, Clock, LogOut, ExternalLink, Copy, Check } from 'lucide-react';

export function DashboardLayout() {
  const { empresa, logout } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/${empresa?.slug}`;

    function onCopied() {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(onCopied).catch(() => fallbackCopy(url, onCopied));
    } else {
      fallbackCopy(url, onCopied);
    }
  }

  function fallbackCopy(text: string, onSuccess: () => void) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      onSuccess();
    } finally {
      document.body.removeChild(ta);
    }
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
            <button
              type="button"
              className={`sidebar-copy-btn${copied ? ' sidebar-copy-btn--copied' : ''}`}
              onClick={handleCopyLink}
              title="Copiar link de agendamento"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copiado!' : 'Copiar link'}
            </button>
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
