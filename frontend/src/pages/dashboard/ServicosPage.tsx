import { useState, useEffect } from 'react';
import { listServicos, createServico, updateServico, deleteServico } from '../../api/servicos';
import type { Servico } from '../../types';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

type FormData = { nome: string; duracao_min: string; preco: string };
const EMPTY: FormData = { nome: '', duracao_min: '', preco: '' };

export function ServicosPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Servico | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function fetchServicos() {
    setLoading(true);
    const data = await listServicos();
    setServicos(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchServicos();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  }

  function openEdit(s: Servico) {
    setEditing(s);
    setForm({ nome: s.nome, duracao_min: String(s.duracao_min), preco: s.preco });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nome || !form.duracao_min || !form.preco) {
      setError('Preencha todos os campos.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { nome: form.nome, duracao_min: Number(form.duracao_min), preco: form.preco };
      if (editing) {
        await updateServico(editing.id, payload);
      } else {
        await createServico(payload);
      }
      setModalOpen(false);
      fetchServicos();
    } catch {
      setError('Erro ao salvar serviço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este serviço?')) return;
    try {
      await deleteServico(id);
      fetchServicos();
    } catch {
      alert('Não foi possível excluir. O serviço pode ter agendamentos vinculados.');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Serviços</h2>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> Novo serviço
        </button>
      </div>

      {loading ? (
        <p className="loading">Carregando...</p>
      ) : servicos.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum serviço cadastrado ainda.</p>
          <button className="btn btn-primary" onClick={openCreate}>
            Adicionar serviço
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Duração</th>
                <th>Preço</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {servicos.map((s) => (
                <tr key={s.id}>
                  <td>{s.nome}</td>
                  <td>{s.duracao_min} min</td>
                  <td>R$ {Number(s.preco).toFixed(2)}</td>
                  <td className="table-actions">
                    <button className="btn-icon" onClick={() => openEdit(s)} title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-icon btn-icon--danger"
                      onClick={() => handleDelete(s.id)}
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

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Editar serviço' : 'Novo serviço'}</h3>
              <button className="btn-icon" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nome</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Duração (minutos)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.duracao_min}
                    onChange={(e) => setForm((f) => ({ ...f, duracao_min: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Preço (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.preco}
                    onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
                  />
                </div>
              </div>
              {error && <p className="form-error">{error}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
