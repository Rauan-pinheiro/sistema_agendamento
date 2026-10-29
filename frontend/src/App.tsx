import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeedbackProvider } from './context/FeedbackContext';
import { PrivateRoute } from './routes/PrivateRoute';

// Code splitting por rota: o cliente final baixa só a página pública;
// o painel (e a biblioteca de gráficos do Financeiro) carrega sob demanda.
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const PublicPage = lazy(() => import('./pages/public/PublicPage').then((m) => ({ default: m.PublicPage })));
const DashboardLayout = lazy(() =>
  import('./pages/dashboard/DashboardLayout').then((m) => ({ default: m.DashboardLayout })));
const HojePage = lazy(() => import('./pages/dashboard/HojePage').then((m) => ({ default: m.HojePage })));
const AgendaPage = lazy(() => import('./pages/dashboard/AgendaPage').then((m) => ({ default: m.AgendaPage })));
const EquipePage = lazy(() => import('./pages/dashboard/EquipePage').then((m) => ({ default: m.EquipePage })));
const ServicosPage = lazy(() =>
  import('./pages/dashboard/ServicosPage').then((m) => ({ default: m.ServicosPage })));
const FinanceiroPage = lazy(() =>
  import('./pages/dashboard/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })));
const TermosPage = lazy(() => import('./pages/legal/PaginasLegais').then((m) => ({ default: m.TermosPage })));
const PrivacidadePage = lazy(() => import('./pages/legal/PaginasLegais').then((m) => ({ default: m.PrivacidadePage })));
const ConfiguracaoPage = lazy(() =>
  import('./pages/dashboard/ConfiguracaoPage').then((m) => ({ default: m.ConfiguracaoPage })));
// Catálogo de componentes: só em desenvolvimento (o Vite remove a rota e o chunk do build)
const CatalogoPage = import.meta.env.DEV
  ? lazy(() => import('./pages/interno/CatalogoPage').then((m) => ({ default: m.CatalogoPage })))
  : null;

function App() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="public-loading" role="status">Carregando…</div>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/termos" element={<TermosPage />} />
              <Route path="/privacidade" element={<PrivacidadePage />} />
              {CatalogoPage && <Route path="/_catalogo" element={<CatalogoPage />} />}
              <Route element={<PrivateRoute />}>
                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<HojePage />} />
                  <Route path="agenda" element={<AgendaPage />} />
                  <Route path="servicos" element={<ServicosPage />} />
                  <Route path="equipe" element={<EquipePage />} />
                  <Route path="financeiro" element={<FinanceiroPage />} />
                  <Route path="ajustes" element={<ConfiguracaoPage />} />
                  {/* Rotas antigas (fase 10 e anteriores) continuam funcionando */}
                  <Route path="profissionais" element={<Navigate to="/dashboard/equipe" replace />} />
                  <Route path="horarios" element={<Navigate to="/dashboard/equipe?aba=horarios" replace />} />
                  <Route path="configuracoes" element={<Navigate to="/dashboard/ajustes" replace />} />
                </Route>
              </Route>
              <Route path="/:slug" element={<PublicPage />} />
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
}

export default App;
