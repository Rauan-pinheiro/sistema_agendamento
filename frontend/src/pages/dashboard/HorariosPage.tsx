import { useState, useEffect } from 'react';
import { Pencil, Trash2, Plus, X, Check } from 'lucide-react';
import { listHorarios, createHorario, updateHorario, deleteHorario } from '../../api/horarios';
import type { HorarioFuncionamento } from '../../types';

const DIAS = [
  { value: 0, label: 'Segunda-feira' },
  { value: 1, label: 'Terça-feira' },
  { value: 2, label: 'Quarta-feira' },
  { value: 3, label: 'Quinta-feira' },
  { value: 4, label: 'Sexta-feira' },
  { value: 5, label: 'Sábado' },
  { value: 6, label: 'Domingo' },
];

const FORM_VAZIO = { dia_semana: 0, hora_inicio: '08:00', hora_fim: '18:00', intervalo_min: 30 };

export function HorariosPage() {
  const [horarios, setHorarios] = useState<HorarioFuncionamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<HorarioFuncionamento | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      setHorarios(await listHorarios());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  function abrirCriar() {
    const diasUsados = new Set(horarios.map((h) => h.dia_semana));
    const primeiroLivre = DIAS.find((d) => !diasUsados.has(d.value));
    setEditando(null);
    setForm({ ...FORM_VAZIO, dia_semana: primeiroLivre?.value ?? 0 });
    setErro('');
    setModalAberto(true);
  }

  function abrirEditar(h: HorarioFuncionamento) {
    setEditando(h);
    setForm({
      dia_semana: h.dia_semana,
      hora_inicio: h.hora_inicio.slice(0, 5),
      hora_fim: h.hora_fim.slice(0, 5),
      intervalo_min: h.intervalo_min,
    });
    setErro('');
    setModalAberto(true);
  }

  async function salvar() {
    setErro('');
    setSalvando(true);
    try {
      if (editando) {
        await updateHorario(editando.id, form);
      } else {
        await createHorario(form);
      }
      setModalAberto(false);
      carregar();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      if (data) setErro(Object.values(data).flat().join(' '));
      else setErro('Erro ao salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: number) {
    if (!confirm('Remover este horário de funcionamento?')) return;
    await deleteHorario(id);
    carregar();
  }

  const diasDisponiveis = DIAS.filter(
    (d) => !horarios.some((h) => h.dia_semana === d.value && h.id !== editando?.id),
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Horários de Funcionamento</h1>
        <button className="btn btn-primary" onClick={abrirCriar} disabled={horarios.length >= 7}>
          <Plus size={16} /> Adicionar dia
        </button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : horarios.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum horário cadastrado.</p>
          <p className="empty-hint">Configure os dias e horários em que você atende para que os clientes vejam os slots disponíveis.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Intervalo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {horarios.map((h) => (
              <tr key={h.id}>
                <td>{DIAS.find((d) => d.value === h.dia_semana)?.label}</td>
                <td>{h.hora_inicio.slice(0, 5)}</td>
                <td>{h.hora_fim.slice(0, 5)}</td>
                <td>{h.intervalo_min} min</td>
                <td className="table-actions">
                  <button className="icon-btn" title="Editar" onClick={() => abrirEditar(h)}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn icon-btn--danger" title="Excluir" onClick={() => remover(h.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editando ? 'Editar horário' : 'Novo horário'}</h2>
              <button className="icon-btn" onClick={() => setModalAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="form-group">
              <label>Dia da semana</label>
              <select
                value={form.dia_semana}
                disabled={!!editando}
                onChange={(e) => setForm((f) => ({ ...f, dia_semana: Number(e.target.value) }))}
              >
                {diasDisponiveis.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Início</label>
                <input
                  type="time"
                  value={form.hora_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Fim</label>
                <input
                  type="time"
                  value={form.hora_fim}
                  onChange={(e) => setForm((f) => ({ ...f, hora_fim: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Intervalo entre slots (minutos)</label>
              <input
                type="number"
                min={5}
                max={120}
                step={5}
                value={form.intervalo_min}
                onChange={(e) => setForm((f) => ({ ...f, intervalo_min: Number(e.target.value) }))}
              />
            </div>

            {erro && <p className="form-error">{erro}</p>}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                <Check size={15} /> {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
