import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrivateRoute } from './routes/PrivateRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardLayout } from './pages/dashboard/DashboardLayout';
import { AgendamentosPage } from './pages/dashboard/AgendamentosPage';
import { ServicosPage } from './pages/dashboard/ServicosPage';
import { PublicPage } from './pages/public/PublicPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<AgendamentosPage />} />
              <Route path="servicos" element={<ServicosPage />} />
            </Route>
          </Route>
          <Route path="/:slug" element={<PublicPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
