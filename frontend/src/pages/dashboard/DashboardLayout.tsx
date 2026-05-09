import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Scissors, LogOut, ExternalLink } from 'lucide-react';

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
