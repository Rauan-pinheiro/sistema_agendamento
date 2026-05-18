import { useState, useEffect } from 'react';
import {
  listProfissionais, createProfissional,
  updateProfissional, deleteProfissional,
} from '../../api/profissionais';
import type { Profissional } from '../../types';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';

type FormData = { nome: string; especialidade: string; ativo: boolean };
const EMPTY: FormData = { nome: '', especialidade: '', ativo: true };

function validateForm(form: FormData): string {
  if (form.nome.trim().length < 2) return 'O nome deve ter pelo menos 2 caracteres.';
  return '';
}

export function ProfissionaisPage() {
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Profissional | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function fetchProfissionais() {
    setLoading(true);
    const data = await listProfissionais();
    setProfissionais(data.results);
    setLoading(false);
  }

  useEffect(() => { fetchProfissionais(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  }

  function openEdit(p: Profissional) {
    setEditing(p);
    setForm({ nome: p.nome, especialidade: p.especialidade ?? '', ativo: p.ativo });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    const err = validateForm(form);
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { nome: form.nome.trim(), especialidade: form.especialidade.trim(), ativo: form.ativo };
      editing ? await updateProfissional(editing.id, payload) : await createProfissional(payload);
      setModalOpen(false);
      fetchProfissionais();
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAtivo(p: Profissional) {
    try {
      await updateProfissional(p.id, { ativo: !p.ativo });
      fetchProfissionais();
    } catch {
      alert('Erro ao alterar status.');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este profissional? Agendamentos vinculados perderão a referência.')) return;
    try {
      await deleteProfissional(id);
      fetchProfissionais();
    } catch {
      alert('Não foi possível excluir.');
    }
  }

  function initials(nome: string) {
    return nome.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Profissionais</h2>
          <p className="page-subtitle">{profissionais.length} profissional{profissionais.length !== 1 ? 'is' : ''} cadastrado{profissionais.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={15} /> Novo profissional
        </Button>
      </div>

      {loading ? (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Nome</th><th>Especialidade</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i}>
                  <td><div className="skeleton skeleton-row" style={{ width: '60%' }} /></td>
                  <td><div className="skeleton skeleton-row" style={{ width: '50%' }} /></td>
                  <td><div className="skeleton skeleton-row" style={{ width: '30%' }} /></td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : profissionais.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={28} /></div>
          <h3>Nenhum profissional cadastrado</h3>
          <p className="empty-hint">
            Adicione os profissionais da sua equipe para que os clientes possam escolhê-los ao agendar.
          </p>
          <Button onClick={openCreate}><Plus size={15} /> Adicionar profissional</Button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Especialidade</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profissionais.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="profissional-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                        {initials(p.nome)}
                      </div>
                      <span style={{ fontWeight: 600 }}>{p.nome}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.especialidade || '—'}</td>
                  <td>
                    <button
                      className={`toggle-btn${p.ativo ? ' toggle-btn--on' : ''}`}
                      onClick={() => handleToggleAtivo(p)}
                      title={p.ativo ? 'Desativar' : 'Ativar'}
                    >
                      <Badge status={p.ativo ? 'confirmado' : 'cancelado'}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </button>
                  </td>
                  <td className="table-actions">
                    <button className="btn-icon" onClick={() => openEdit(p)} title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-icon btn-icon--danger"
                      onClick={() => handleDelete(p.id)}
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar profissional' : 'Novo profissional'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={handleSave}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label>Nome</label>
          <input
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            autoFocus
            placeholder="Ex: Carlos Silva"
          />
        </div>
        <div className="form-group">
          <label>Especialidade <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
          <input
            value={form.especialidade}
            onChange={(e) => setForm((f) => ({ ...f, especialidade: e.target.value }))}
            placeholder="Ex: Barbeiro, Colorista..."
          />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            Profissional ativo (aparece nas opções de agendamento)
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
      </Modal>
    </div>
  );
}
