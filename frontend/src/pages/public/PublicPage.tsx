import { useState, useEffect, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  getEmpresaPublica,
  listServicosPublicos,
  createAgendamentoPublico,
} from '../../api/public';
import type { Empresa, Servico } from '../../types';
import { CheckCircle } from 'lucide-react';

export function PublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    servico: '',
    data_hora: '',
    nome_cliente: '',
    whatsapp_cliente: '',
  });

  useEffect(() => {
    if (!slug) return;
    Promise.all([getEmpresaPublica(slug), listServicosPublicos(slug)])
      .then(([emp, svcs]) => {
        setEmpresa(emp);
        setServicos(svcs);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await createAgendamentoPublico(slug!, {
        servico: Number(form.servico),
        data_hora: form.data_hora,
        nome_cliente: form.nome_cliente,
        whatsapp_cliente: form.whatsapp_cliente,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      if (data?.data_hora) {
        const msg = data.data_hora;
        setFormError(Array.isArray(msg) ? (msg[0] as string) : String(msg));
      } else if (data) {
        setFormError(Object.values(data).flat().join(' '));
      } else {
        setFormError('Erro ao criar agendamento. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSuccess(false);
    setForm({ servico: '', data_hora: '', nome_cliente: '', whatsapp_cliente: '' });
  }

  if (loading) return <div className="public-loading">Carregando...</div>;
  if (notFound)
    return (
      <div className="public-not-found">
        <h2>Empresa não encontrada</h2>
        <p>Verifique o link e tente novamente.</p>
      </div>
    );

  if (success) {
    return (
      <div className="public-page">
        <div className="public-success">
          <CheckCircle size={60} className="success-icon" />
          <h2>Agendamento solicitado!</h2>
          <p>Aguarde a confirmação via WhatsApp.</p>
          <button className="btn btn-primary" onClick={resetForm}>
            Fazer outro agendamento
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <h1>{empresa?.nome_fantasia}</h1>
        <a
          href={`https://wa.me/${empresa?.whatsapp_contato}`}
          className="whatsapp-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          💬 {empresa?.whatsapp_contato}
        </a>
      </header>

      <div className="public-body">
        <section className="public-services">
          <h2>Nossos serviços</h2>
          <div className="service-cards">
            {servicos.map((s) => (
              <div
                key={s.id}
                className={`service-card${form.servico === String(s.id) ? ' selected' : ''}`}
                onClick={() => setForm((f) => ({ ...f, servico: String(s.id) }))}
              >
                <p className="service-name">{s.nome}</p>
                <p className="service-detail">
                  {s.duracao_min} min · R$ {Number(s.preco).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <form className="public-form" onSubmit={handleSubmit}>
          <h2>Fazer agendamento</h2>
          <div className="form-group">
            <label>Serviço</label>
            <select
              value={form.servico}
              onChange={(e) => setForm((f) => ({ ...f, servico: e.target.value }))}
              required
            >
              <option value="">Selecione um serviço</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} — R$ {Number(s.preco).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Data e horário</label>
            <input
              type="datetime-local"
              value={form.data_hora}
              onChange={(e) => setForm((f) => ({ ...f, data_hora: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Seu nome</label>
            <input
              value={form.nome_cliente}
              onChange={(e) => setForm((f) => ({ ...f, nome_cliente: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>WhatsApp</label>
            <input
              value={form.whatsapp_cliente}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_cliente: e.target.value }))}
              required
              placeholder="85999990000"
            />
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={submitting || !form.servico}
          >
            {submitting ? 'Agendando...' : 'Solicitar agendamento'}
          </button>
        </form>
      </div>
    </div>
  );
}
