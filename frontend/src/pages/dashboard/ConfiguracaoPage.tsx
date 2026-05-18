import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { Building2, User, Lock, CheckCircle, AlertCircle, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { updateEmpresa } from '../../api/empresa';
import { getPerfilUsuario, updatePerfilUsuario } from '../../api/usuario';
import { formatPhone, normalizePhone, isValidPhone } from '../../utils/phone';
import type { PerfilUsuario } from '../../types';

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');
}

export function ConfiguracaoPage() {
  const { empresa, atualizarEmpresa } = useAuth();

  // ── Empresa form ──────────────────────────────────────────────────────────
  const [empresaForm, setEmpresaForm] = useState({
    nome_fantasia: empresa?.nome_fantasia ?? '',
    slug: empresa?.slug ?? '',
    whatsapp_contato: empresa ? formatPhone(empresa.whatsapp_contato) : '',
  });
  const [empresaLoading, setEmpresaLoading] = useState(false);
  const [empresaFeedback, setEmpresaFeedback] = useState<FeedbackState>(null);

  // ── Perfil (conta) form ───────────────────────────────────────────────────
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [perfilForm, setPerfilForm] = useState({ username: '', email: '' });
  const [perfilLoading, setPerfilLoading] = useState(false);
  const [perfilFeedback, setPerfilFeedback] = useState<FeedbackState>(null);

  // ── Senha form ────────────────────────────────────────────────────────────
  const [senhaForm, setSenhaForm] = useState({
    password_atual: '',
    password_nova: '',
    password_nova_confirm: '',
  });
  const [senhaLoading, setSenhaLoading] = useState(false);
  const [senhaFeedback, setSenhaFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    getPerfilUsuario().then(p => {
      setPerfil(p);
      setPerfilForm({ username: p.username, email: p.email });
    });
  }, []);

  // Sync empresa form when context updates
  useEffect(() => {
    if (empresa) {
      setEmpresaForm({
        nome_fantasia: empresa.nome_fantasia,
        slug: empresa.slug,
        whatsapp_contato: formatPhone(empresa.whatsapp_contato),
      });
    }
  }, [empresa]);

  // ── Handlers empresa ──────────────────────────────────────────────────────
  function handleEmpresaChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name === 'whatsapp_contato') {
      setEmpresaForm(prev => ({ ...prev, whatsapp_contato: formatPhone(value) }));
    } else if (name === 'slug') {
      setEmpresaForm(prev => ({ ...prev, slug: value.toLowerCase().replace(/[^a-z0-9-]/g, '') }));
    } else {
      setEmpresaForm(prev => ({ ...prev, [name]: value }));
    }
  }

  async function handleEmpresaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!empresa) return;

    const phone = normalizePhone(empresaForm.whatsapp_contato);
    if (!isValidPhone(phone)) {
      setEmpresaFeedback({ type: 'error', message: 'WhatsApp inválido. Use DDD + número (ex: 85 99999-0000).' });
      return;
    }
    if (empresaForm.nome_fantasia.trim().length < 2) {
      setEmpresaFeedback({ type: 'error', message: 'O nome deve ter pelo menos 2 caracteres.' });
      return;
    }
    if (empresaForm.slug.length < 3) {
      setEmpresaFeedback({ type: 'error', message: 'O link público deve ter pelo menos 3 caracteres.' });
      return;
    }

    setEmpresaLoading(true);
    setEmpresaFeedback(null);
    try {
      const atualizada = await updateEmpresa(empresa.id, {
        nome_fantasia: empresaForm.nome_fantasia.trim(),
        slug: empresaForm.slug,
        whatsapp_contato: phone,
      });
      atualizarEmpresa(atualizada);
      setEmpresaFeedback({ type: 'success', message: 'Dados da empresa atualizados com sucesso!' });
    } catch (err: unknown) {
      const msg = extractError(err) ?? 'Erro ao salvar. Verifique os dados e tente novamente.';
      setEmpresaFeedback({ type: 'error', message: msg });
    } finally {
      setEmpresaLoading(false);
    }
  }

  // ── Handlers perfil ───────────────────────────────────────────────────────
  async function handlePerfilSubmit(e: FormEvent) {
    e.preventDefault();
    setPerfilLoading(true);
    setPerfilFeedback(null);
    try {
      const atualizado = await updatePerfilUsuario({
        username: perfilForm.username.trim(),
        email: perfilForm.email.trim(),
      });
      setPerfil(atualizado);
      setPerfilFeedback({ type: 'success', message: 'Dados da conta atualizados com sucesso!' });
    } catch (err: unknown) {
      const msg = extractError(err) ?? 'Erro ao salvar. Tente novamente.';
      setPerfilFeedback({ type: 'error', message: msg });
    } finally {
      setPerfilLoading(false);
    }
  }

  // ── Handlers senha ────────────────────────────────────────────────────────
  async function handleSenhaSubmit(e: FormEvent) {
    e.preventDefault();
    if (senhaForm.password_nova !== senhaForm.password_nova_confirm) {
      setSenhaFeedback({ type: 'error', message: 'As senhas não conferem.' });
      return;
    }
    if (senhaForm.password_nova.length < 8) {
      setSenhaFeedback({ type: 'error', message: 'A nova senha deve ter pelo menos 8 caracteres.' });
      return;
    }
    setSenhaLoading(true);
    setSenhaFeedback(null);
    try {
      await updatePerfilUsuario(senhaForm);
      setSenhaForm({ password_atual: '', password_nova: '', password_nova_confirm: '' });
      setSenhaFeedback({ type: 'success', message: 'Senha alterada com sucesso!' });
    } catch (err: unknown) {
      const msg = extractError(err) ?? 'Erro ao alterar senha. Verifique sua senha atual.';
      setSenhaFeedback({ type: 'error', message: msg });
    } finally {
      setSenhaLoading(false);
    }
  }

  const initials = perfil ? getInitials(perfil.username) : (empresa ? getInitials(empresa.nome_fantasia) : '?');

  return (
    <div className="page config-page">
      {/* Profile header */}
      <div className="config-profile-header">
        <div className="config-avatar">{initials}</div>
        <div className="config-profile-info">
          <h2 className="config-profile-name">{perfil?.username ?? '—'}</h2>
          <p className="config-profile-email">{perfil?.email ?? '—'}</p>
          <p className="config-profile-empresa">{empresa?.nome_fantasia} · /{empresa?.slug}</p>
        </div>
      </div>

      {/* Empresa section */}
      <div className="config-section">
        <div className="config-section-header">
          <div className="config-section-icon config-section-icon--blue">
            <Building2 size={16} />
          </div>
          <div>
            <h3>Dados da Empresa</h3>
            <p className="config-section-desc">Nome de exibição, link público e contato WhatsApp</p>
          </div>
        </div>
        <form className="config-section-body" onSubmit={handleEmpresaSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Nome Fantasia</label>
              <input
                name="nome_fantasia"
                value={empresaForm.nome_fantasia}
                onChange={handleEmpresaChange}
                placeholder="Ex: Barbearia do João"
                required
              />
            </div>
            <div className="form-group">
              <label>Link Público</label>
              <input
                name="slug"
                value={empresaForm.slug}
                onChange={handleEmpresaChange}
                placeholder="Ex: barbearia-joao"
                required
              />
              <span className="form-hint config-slug-preview">
                devflow.app/<strong>{empresaForm.slug || 'seu-link'}</strong>
              </span>
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: 280 }}>
            <label>WhatsApp de Contato</label>
            <input
              name="whatsapp_contato"
              value={empresaForm.whatsapp_contato}
              onChange={handleEmpresaChange}
              placeholder="(85) 99999-0000"
              required
            />
          </div>
          {empresaForm.slug !== empresa?.slug && (
            <div className="config-alert">
              <AlertCircle size={14} />
              Atenção: alterar o link público invalida todos os bookmarks dos seus clientes.
            </div>
          )}
          <Feedback state={empresaFeedback} />
          <div className="config-section-footer">
            <button className="btn btn-primary btn-sm" type="submit" disabled={empresaLoading}>
              {empresaLoading ? <span className="btn-spinner" /> : <Save size={14} />}
              Salvar empresa
            </button>
          </div>
        </form>
      </div>

      {/* Conta section */}
      <div className="config-section">
        <div className="config-section-header">
          <div className="config-section-icon config-section-icon--purple">
            <User size={16} />
          </div>
          <div>
            <h3>Dados da Conta</h3>
            <p className="config-section-desc">Usuário e e-mail usados para fazer login</p>
          </div>
        </div>
        <form className="config-section-body" onSubmit={handlePerfilSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Nome de Usuário</label>
              <input
                value={perfilForm.username}
                onChange={e => setPerfilForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Ex: joaosilva"
                required
              />
            </div>
            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                value={perfilForm.email}
                onChange={e => setPerfilForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="joao@email.com"
                required
              />
            </div>
          </div>
          <Feedback state={perfilFeedback} />
          <div className="config-section-footer">
            <button className="btn btn-primary btn-sm" type="submit" disabled={perfilLoading}>
              {perfilLoading ? <span className="btn-spinner" /> : <Save size={14} />}
              Salvar conta
            </button>
          </div>
        </form>
      </div>

      {/* Senha section */}
      <div className="config-section">
        <div className="config-section-header">
          <div className="config-section-icon config-section-icon--green">
            <Lock size={16} />
          </div>
          <div>
            <h3>Alterar Senha</h3>
            <p className="config-section-desc">Deixe em branco para manter a senha atual</p>
          </div>
        </div>
        <form className="config-section-body" onSubmit={handleSenhaSubmit}>
          <div className="form-group" style={{ maxWidth: 340 }}>
            <label>Senha Atual</label>
            <input
              type="password"
              value={senhaForm.password_atual}
              onChange={e => setSenhaForm(prev => ({ ...prev, password_atual: e.target.value }))}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Nova Senha</label>
              <input
                type="password"
                value={senhaForm.password_nova}
                onChange={e => setSenhaForm(prev => ({ ...prev, password_nova: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-group">
              <label>Confirmar Nova Senha</label>
              <input
                type="password"
                value={senhaForm.password_nova_confirm}
                onChange={e => setSenhaForm(prev => ({ ...prev, password_nova_confirm: e.target.value }))}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <Feedback state={senhaFeedback} />
          <div className="config-section-footer">
            <button className="btn btn-danger btn-sm" type="submit" disabled={senhaLoading}>
              {senhaLoading ? <span className="btn-spinner" /> : <Lock size={14} />}
              Alterar senha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Feedback({ state }: { state: FeedbackState }) {
  if (!state) return null;
  const isSuccess = state.type === 'success';
  return (
    <div className={`config-feedback config-feedback--${state.type}`}>
      {isSuccess ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
      {state.message}
    </div>
  );
}

function extractError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  const resp = e['response'] as Record<string, unknown> | undefined;
  if (!resp) return null;
  const data = resp['data'];
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const vals = Object.values(data as Record<string, unknown>).flat();
    const first = vals[0];
    return typeof first === 'string' ? first : null;
  }
  return null;
}
