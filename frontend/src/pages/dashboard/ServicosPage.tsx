import { useState, useEffect } from 'react';
import { listServicos, createServico, updateServico, deleteServico } from '../../api/servicos';
import type { Servico } from '../../types';
import { Plus, Pencil, Trash2, Scissors } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';

type FormData = { nome: string; descricao: string; duracao_min: string; preco: string };
const EMPTY: FormData = { nome: '', descricao: '', duracao_min: '', preco: '' };

function validateForm(form: FormData): string {
  if (form.nome.trim().length < 2) return 'O nome do serviço deve ter pelo menos 2 caracteres.';
  const dur = Number(form.duracao_min);
  if (!form.duracao_min || isNaN(dur) || dur < 5) return 'A duração mínima é de 5 minutos.';
  if (dur > 480) return 'A duração máxima é de 480 minutos (8 horas).';
  const preco = Number(form.preco);
  if (form.preco === '' || isNaN(preco)) return 'Informe um preço válido.';
  if (preco < 0) return 'O preço não pode ser negativo.';
  return '';
}

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

  useEffect(() => { fetchServicos(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  }

  function openEdit(s: Servico) {
    setEditing(s);
    setForm({ nome: s.nome, descricao: s.descricao ?? '', duracao_min: String(s.duracao_min), preco: s.preco });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    const err = validateForm(form);
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        duracao_min: Number(form.duracao_min),
        preco: form.preco,
      };
      editing ? await updateServico(editing.id, payload) : await createServico(payload);
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
        <div>
          <h2>Serviços</h2>
          <p className="page-subtitle">{servicos.length} serviço{servicos.length !== 1 ? 's' : ''} cadastrado{servicos.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={15} /> Novo serviço
        </Button>
      </div>

      {loading ? (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Nome</th><th>Duração</th><th>Preço</th><th></th></tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i}>
                  <td><div className="skeleton skeleton-row" style={{ width: '60%' }} /></td>
                  <td><div className="skeleton skeleton-row" style={{ width: '40%' }} /></td>
                  <td><div className="skeleton skeleton-row" style={{ width: '40%' }} /></td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : servicos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Scissors size={28} /></div>
          <h3>Nenhum serviço cadastrado ainda</h3>
          <p className="empty-hint">
            Adicione os serviços que você oferece com nome, duração e preço para que os clientes possam agendar.
          </p>
          <Button onClick={openCreate}><Plus size={15} /> Adicionar serviço</Button>
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
                  <td>
                    <span style={{ fontWeight: 600 }}>{s.nome}</span>
                    {s.descricao && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.descricao}</p>}
                  </td>
                  <td>{s.duracao_min} min</td>
                  <td>{Number(s.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar serviço' : 'Novo serviço'}
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
            placeholder="Ex: Corte masculino"
          />
        </div>
        <div className="form-group">
          <label>Descrição <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
          <textarea
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            placeholder="Descreva o serviço para o cliente..."
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Duração (minutos)</label>
            <input
              type="number"
              min="5"
              max="480"
              value={form.duracao_min}
              onChange={(e) => setForm((f) => ({ ...f, duracao_min: e.target.value }))}
              placeholder="30"
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
              placeholder="50.00"
            />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
      </Modal>
    </div>
  );
}
