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
const AgendamentosPage = lazy(() =>
  import('./pages/dashboard/AgendamentosPage').then((m) => ({ default: m.AgendamentosPage })));
const ServicosPage = lazy(() =>
  import('./pages/dashboard/ServicosPage').then((m) => ({ default: m.ServicosPage })));
const ProfissionaisPage = lazy(() =>
  import('./pages/dashboard/ProfissionaisPage').then((m) => ({ default: m.ProfissionaisPage })));
const HorariosPage = lazy(() =>
  import('./pages/dashboard/HorariosPage').then((m) => ({ default: m.HorariosPage })));
const FinanceiroPage = lazy(() =>
  import('./pages/dashboard/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })));
const ConfiguracaoPage = lazy(() =>
  import('./pages/dashboard/ConfiguracaoPage').then((m) => ({ default: m.ConfiguracaoPage })));

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
              <Route element={<PrivateRoute />}>
                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<AgendamentosPage />} />
                  <Route path="servicos" element={<ServicosPage />} />
                  <Route path="profissionais" element={<ProfissionaisPage />} />
                  <Route path="horarios" element={<HorariosPage />} />
                  <Route path="financeiro" element={<FinanceiroPage />} />
                  <Route path="configuracoes" element={<ConfiguracaoPage />} />
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
