import { useState, type ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { RegistroPayload } from '../types';
import { CalendarDays } from 'lucide-react';
import { formatPhone, normalizePhone, isValidPhone } from '../utils/phone';

const EMPTY: RegistroPayload = {
  username: '',
  email: '',
  password: '',
  password_confirm: '',
  nome_fantasia: '',
  slug: '',
  whatsapp_contato: '',
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function validateLocal(form: RegistroPayload): string {
  if (form.username.trim().length < 3)
    return 'O nome de usuário deve ter pelo menos 3 caracteres.';
  if (!/^[a-zA-Z0-9_]+$/.test(form.username))
    return 'Usuário: use apenas letras, números e underscores.';
  if (!form.email.includes('@'))
    return 'Informe um e-mail válido.';
  if (form.password.length < 8)
    return 'A senha deve ter pelo menos 8 caracteres.';
  if (form.password !== form.password_confirm)
    return 'As senhas não conferem.';
  if (form.nome_fantasia.trim().length < 2)
    return 'O nome da empresa deve ter pelo menos 2 caracteres.';
  if (form.slug.length < 3)
    return 'O link público deve ter pelo menos 3 caracteres.';
  if (!isValidPhone(form.whatsapp_contato))
    return 'Informe um WhatsApp válido com DDD. Ex: (85) 99999-0000.';
  return '';
}

export function RegisterPage() {
  const { registrar } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegistroPayload>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((f) => {
      const next = { ...f, [name]: value };
      if (name === 'nome_fantasia' && !slugEdited) next.slug = toSlug(value);
      if (name === 'slug') setSlugEdited(true);
      return next;
    });
  }

  function handleWhatsapp(e: ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, whatsapp_contato: formatPhone(e.target.value) }));
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const localError = validateLocal(form);
    if (localError) { setError(localError); return; }
    setError('');
    setLoading(true);
    try {
      const payload: RegistroPayload = {
        ...form,
        whatsapp_contato: normalizePhone(form.whatsapp_contato),
      };
      await registrar(payload);
      navigate('/dashboard');
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(' '));
      } else {
        setError('Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <CalendarDays size={20} />
          </div>
          <span className="auth-logo-text">AgendaFácil</span>
        </div>

        <div>
          <h1 className="auth-title">Crie sua conta</h1>
          <p className="auth-subtitle">Configure o painel do seu negócio em minutos</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <p className="form-section-title">Dados de acesso</p>
            <div className="form-row">
              <div className="form-group">
                <label>Usuário</label>
                <input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  required
                  minLength={3}
                  placeholder="seunome"
                />
              </div>
              <div className="form-group">
                <label>E-mail</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="email@empresa.com"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Senha</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  placeholder="mín. 8 caracteres"
                />
              </div>
              <div className="form-group">
                <label>Confirmar senha</label>
                <input
                  type="password"
                  name="password_confirm"
                  value={form.password_confirm}
                  onChange={handleChange}
                  required
                  placeholder="repita a senha"
                />
              </div>
            </div>
          </div>

          <div className="form-divider" />

          <div className="form-section">
            <p className="form-section-title">Dados da empresa</p>
            <div className="form-group">
              <label>Nome da empresa</label>
              <input
                name="nome_fantasia"
                value={form.nome_fantasia}
                onChange={handleChange}
                required
                minLength={2}
                placeholder="Ex: Barbearia do João"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Link público (slug)</label>
                <input
                  name="slug"
                  value={form.slug}
                  onChange={handleChange}
                  required
                  minLength={3}
                  pattern="[a-z0-9-]+"
                  title="Apenas letras minúsculas, números e hífens"
                  placeholder="barbearia-joao"
                />
                <span className="form-hint">/{form.slug || 'sua-empresa'}</span>
              </div>
              <div className="form-group">
                <label>WhatsApp</label>
                <input
                  name="whatsapp_contato"
                  value={form.whatsapp_contato}
                  onChange={handleWhatsapp}
                  required
                  placeholder="(85) 99999-0000"
                  inputMode="numeric"
                />
                <span className="form-hint">Com DDD, somente números</span>
              </div>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="auth-footer">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
