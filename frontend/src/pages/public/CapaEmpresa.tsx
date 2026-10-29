import { MessageCircle, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import type { Empresa } from '../../types';
import { iniciais } from '../../utils/cor';
import { formatPhone } from '../../utils/phone';

/**
 * Capa da página pública. Com foto: imagem de ponta a ponta (srcset, prioridade alta para o LCP)
 * sob um véu escuro. Sem foto: gradiente da cor da empresa com as iniciais em marca-d'água,
 * para a página não ficar "vazia" quando a empresa ainda não enviou imagens.
 */
export function CapaEmpresa({ empresa }: { empresa: Empresa }) {
  const { theme, toggleTheme } = useTheme();
  const comFoto = !!empresa.capa;
  const sigla = iniciais(empresa.nome_fantasia);

  return (
    <header className={`capa ${comFoto ? 'capa--foto' : 'capa--cor'}`}>
      {empresa.capa ? (
        <img
          className="capa-img"
          src={empresa.capa.url}
          srcSet={empresa.capa.srcset}
          sizes="100vw"
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      ) : (
        <span className="capa-marca" aria-hidden>{sigla}</span>
      )}
      <div className="capa-barra">
        <button type="button" className="btn-icon capa-vidro" onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      <div className="capa-info">
        {empresa.logo_url
          ? <img className="capa-logo" src={empresa.logo_url} alt="" width={64} height={64} />
          : <span className="capa-logo capa-logo--sigla" aria-hidden>{sigla}</span>}
        <h1>{empresa.nome_fantasia}</h1>
        <p className="capa-sub">
          <span>Agende online e receba a confirmação no WhatsApp</span>
          {empresa.whatsapp_contato && (
            <a href={`https://wa.me/55${empresa.whatsapp_contato}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} aria-hidden /> {formatPhone(empresa.whatsapp_contato)}
            </a>
          )}
        </p>
      </div>
    </header>
  );
}
