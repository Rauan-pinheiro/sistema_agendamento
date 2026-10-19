import { useState, type FormEvent } from 'react';
import { Download, ShieldCheck, Trash2, UserX } from 'lucide-react';
import { anonimizarCliente, excluirConta, exportarDados } from '../api/conta';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { mensagemDeErro } from '../utils/erros';
import { formatPhone, isValidPhone, normalizePhone } from '../utils/phone';

/** Configurações → Privacidade e dados (LGPD): exportar, remover dados de cliente, excluir conta. */
export function PrivacidadeDados() {
  const { logout, empresa } = useAuth();
  const { toast, confirmar } = useFeedback();
  const [exportando, setExportando] = useState(false);
  const [fone, setFone] = useState('');
  const [anonimizando, setAnonimizando] = useState(false);
  const [senha, setSenha] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  async function baixar() {
    setExportando(true);
    try {
      const blob = await exportarDados();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dados-${empresa?.slug ?? 'conta'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(mensagemDeErro(err, 'Não foi possível exportar os dados.'), 'erro');
    } finally {
      setExportando(false);
    }
  }

  async function removerCliente(e: FormEvent) {
    e.preventDefault();
    if (!isValidPhone(fone)) { toast('Informe o WhatsApp do cliente com DDD.', 'erro'); return; }
    const ok = await confirmar({
      titulo: 'Remover dados deste cliente?',
      mensagem: `Nome e WhatsApp de ${fone} serão apagados de todos os agendamentos, junto com as fotos e vídeos anexados. Datas e valores continuam no histórico, sem identificar a pessoa.`,
      confirmar: 'Remover dados',
      perigo: true,
    });
    if (!ok) return;
    setAnonimizando(true);
    try {
      const total = await anonimizarCliente(normalizePhone(fone));
      toast(total ? `Dados removidos de ${total} agendamento(s).` : 'Nenhum agendamento com esse WhatsApp.');
      setFone('');
    } catch (err) {
      toast(mensagemDeErro(err), 'erro');
    } finally {
      setAnonimizando(false);
    }
  }

  async function apagarConta(e: FormEvent) {
    e.preventDefault();
    const ok = await confirmar({
      titulo: 'Excluir sua conta definitivamente?',
      mensagem: 'A empresa, os serviços, os profissionais, todos os agendamentos e os arquivos serão apagados. Não dá para desfazer. Se quiser guardar uma cópia, exporte os dados antes.',
      confirmar: 'Excluir conta',
      perigo: true,
    });
    if (!ok) return;
    setExcluindo(true);
    try {
      await excluirConta(senha);
      logout();
    } catch (err) {
      toast(mensagemDeErro(err, 'Não foi possível excluir a conta.'), 'erro');
      setExcluindo(false);
    }
  }

  return (
    <div className="config-section">
      <div className="config-section-header">
        <div className="config-section-icon"><ShieldCheck size={16} aria-hidden /></div>
        <div>
          <h3>Privacidade e dados</h3>
          <p className="config-section-desc">Seus direitos e os dos seus clientes pela LGPD</p>
        </div>
      </div>
      <div className="config-section-body config-privacidade">
        <div>
          <h4>Exportar meus dados</h4>
          <p className="config-section-desc">Um arquivo JSON com a empresa, serviços, profissionais, horários e agendamentos.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={baixar} disabled={exportando}>
            {exportando ? <span className="btn-spinner" aria-hidden /> : <Download size={14} aria-hidden />}
            Baixar dados
          </button>
        </div>

        <form onSubmit={removerCliente}>
          <h4>Remover dados de um cliente</h4>
          <p className="config-section-desc">Use quando um cliente pedir a exclusão dos dados dele.</p>
          <div className="form-group" style={{ maxWidth: 340 }}>
            <label htmlFor="lgpd-fone">WhatsApp do cliente</label>
            <input id="lgpd-fone" inputMode="tel" placeholder="(85) 98888-7777" value={fone}
              onChange={(e) => setFone(formatPhone(e.target.value))} />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={anonimizando || !fone}>
            {anonimizando ? <span className="btn-spinner" aria-hidden /> : <UserX size={14} aria-hidden />}
            Remover dados do cliente
          </button>
        </form>

        <form onSubmit={apagarConta}>
          <h4>Excluir minha conta</h4>
          <p className="config-section-desc">Apaga tudo de forma definitiva. Confirme com sua senha.</p>
          <div className="form-group" style={{ maxWidth: 340 }}>
            <label htmlFor="lgpd-senha">Senha atual</label>
            <input id="lgpd-senha" type="password" autoComplete="current-password" value={senha}
              onChange={(e) => setSenha(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-danger btn-sm" disabled={excluindo || !senha}>
            {excluindo ? <span className="btn-spinner" aria-hidden /> : <Trash2 size={14} aria-hidden />}
            Excluir conta
          </button>
        </form>
      </div>
    </div>
  );
}
