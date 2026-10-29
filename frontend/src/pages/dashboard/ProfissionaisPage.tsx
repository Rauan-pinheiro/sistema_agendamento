import { useState, useEffect, useCallback } from 'react';
import {
  listProfissionais, createProfissional,
  updateProfissional, deleteProfissional,
} from '../../api/profissionais';
import type { Profissional } from '../../types';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Avatar, CampoImagem } from '../../components/ui';
import { enviarFotoProfissional, removerFotoProfissional } from '../../api/imagens';
import { Button } from '../../components/Button';
import { useFeedback } from '../../context/FeedbackContext';
import { mensagemDeErro } from '../../utils/erros';

type FormData = { nome: string; especialidade: string; ativo: boolean };
const EMPTY: FormData = { nome: '', especialidade: '', ativo: true };

function validateForm(form: FormData): string {
  if (form.nome.trim().length < 2) return 'O nome deve ter pelo menos 2 caracteres.';
  return '';
}

export function ProfissionaisPage() {
  const { confirmar, toast } = useFeedback();
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Profissional | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /** Foto salva no servidor: atualiza o modal e a lista sem fechar. */
  function trocarFoto(atualizado: Profissional) {
    setEditing(atualizado);
    setProfissionais((lista) => lista.map((x) => (x.id === atualizado.id ? atualizado : x)));
  }

  const fetchProfissionais = useCallback(() =>
    listProfissionais()
      .then((data) => setProfissionais(data.results))
      .catch((err) => toast(mensagemDeErro(err, 'Não foi possível carregar os profissionais.'), 'erro'))
      .finally(() => setLoading(false)), [toast]);

  useEffect(() => { fetchProfissionais(); }, [fetchProfissionais]);

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
      if (editing) await updateProfissional(editing.id, payload);
      else await createProfissional(payload);
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
      toast('Não foi possível alterar o status. Tente de novo.', 'erro');
    }
  }

  async function handleDelete(id: number) {
    const ok = await confirmar({
      titulo: 'Excluir este profissional?',
      mensagem: 'Os agendamentos dele continuam no histórico, mas sem profissional vinculado.',
      confirmar: 'Excluir profissional',
      perigo: true,
    });
    if (!ok) return;
    try {
      await deleteProfissional(id);
      toast('Profissional excluído.');
      fetchProfissionais();
    } catch {
      toast('Não foi possível excluir o profissional. Tente de novo.', 'erro');
    }
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
          <table className="table table-responsive">
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
          <table className="table table-responsive">
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
                  <td data-label="Profissional">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar nome={p.nome} foto={p.foto_url} tamanho={32} />
                      <span style={{ fontWeight: 600 }}>{p.nome}</span>
                    </div>
                  </td>
                  <td data-label="Especialidade" style={{ color: 'var(--text-muted)' }}>{p.especialidade || '—'}</td>
                  <td data-label="Status">
                    <button
                      className={`toggle-btn${p.ativo ? ' toggle-btn--on' : ''}`}
                      onClick={() => handleToggleAtivo(p)}
                      title={p.ativo ? 'Desativar' : 'Ativar'}
                    >
                      <span className={`badge badge--${p.ativo ? 'confirmado' : 'cancelado'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </button>
                  </td>
                  <td className="table-actions">
                    <button className="btn-icon" onClick={() => openEdit(p)} title="Editar" aria-label="Editar">
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-icon btn-icon--danger"
                      onClick={() => handleDelete(p.id)}
                      title="Excluir" aria-label="Excluir"
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
        {editing ? (
          <CampoImagem rotulo="Foto" url={editing.foto_url}
            dica="Aparece na sua página para o cliente escolher com quem agendar."
            vazio={<Avatar nome={editing.nome} tamanho={72} />}
            onEnviar={async (f, prog) => trocarFoto(await enviarFotoProfissional(editing.id, f, prog))}
            onRemover={async () => trocarFoto(await removerFotoProfissional(editing.id))} />
        ) : (
          <p className="form-hint">Depois de salvar, você pode adicionar a foto do profissional.</p>
        )}
        <div className="form-group">
          <label htmlFor="profissionais-1">Nome</label>
          <input
            id="profissionais-1" value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            autoFocus
            placeholder="Ex: Carlos Silva"
          />
        </div>
        <div className="form-group">
          <label htmlFor="profissionais-2">Especialidade <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
          <input
            id="profissionais-2" value={form.especialidade}
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
