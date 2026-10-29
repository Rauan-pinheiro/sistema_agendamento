import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { updateEmpresa } from '../../../api/empresa';
import { enviarImagemEmpresa, removerImagemEmpresa } from '../../../api/imagens';
import { CampoImagem } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useFeedback } from '../../../context/FeedbackContext';
import { CORES_SUGERIDAS, corLegivel, iniciais } from '../../../utils/cor';
import { mensagemDeErro } from '../../../utils/erros';

/** Aparência da página pública: cor da empresa, capa e logo (fotos vão para o Cloudinary da empresa). */
export function PaginaPublicaAjustes() {
  const { empresa, atualizarEmpresa } = useAuth();
  const { toast } = useFeedback();
  const [salvandoCor, setSalvandoCor] = useState<string | null>(null);
  if (!empresa) return null;

  async function escolherCor(cor: string) {
    if (!empresa || cor.toUpperCase() === empresa.cor_destaque.toUpperCase()) return;
    if (!corLegivel(cor)) {
      toast('Essa cor deixa o texto difícil de ler. Escolha um tom mais escuro ou mais claro.', 'erro');
      return;
    }
    setSalvandoCor(cor);
    try {
      atualizarEmpresa(await updateEmpresa(empresa.id, { cor_destaque: cor.toUpperCase() }));
      toast('Cor da página atualizada');
    } catch (e) {
      toast(mensagemDeErro(e, 'Não foi possível salvar a cor.'), 'erro');
    } finally {
      setSalvandoCor(null);
    }
  }

  const sigla = iniciais(empresa.nome_fantasia);
  return (
    <section className="config-section" aria-labelledby="titulo-pagina-publica">
      <div className="config-section-header">
        <div className="config-section-icon"><Palette size={18} aria-hidden /></div>
        <div>
          <h3 id="titulo-pagina-publica">Sua página pública</h3>
          <p className="config-section-desc">Cor, capa e logo que seus clientes veem ao agendar.</p>
        </div>
      </div>
      <div className="config-section-body">
        <div className="campo-grupo">
          <span className="form-label" id="rot-cor">Cor da empresa</span>
          <span className="form-hint">Usada nos botões e na seleção. O contraste é ajustado sozinho nos temas claro e escuro.</span>
          <div className="cor-destaque" role="group" aria-labelledby="rot-cor">
            {CORES_SUGERIDAS.map((c) => {
              const atual = c.toUpperCase() === empresa.cor_destaque.toUpperCase();
              return (
                <button key={c} type="button" className="cor-destaque-opcao" style={{ background: c }}
                  aria-pressed={atual} aria-label={`Cor ${c}`} disabled={!!salvandoCor} onClick={() => escolherCor(c)}>
                  {atual && <Check size={16} color={c === '#FFD25E' || c === '#9FD8C8' ? '#17262A' : '#FFFFFF'} aria-hidden />}
                </button>
              );
            })}
            <label className="cor-destaque-outra">
              <span>Outra</span>
              <input type="color" value={empresa.cor_destaque} onChange={(e) => escolherCor(e.target.value)} disabled={!!salvandoCor} />
            </label>
          </div>
        </div>

        <CampoImagem rotulo="Capa" formato="capa" url={empresa.capa?.url}
          dica="Foto do salão na horizontal (16:9). Sem capa, a página usa um gradiente da sua cor."
          vazio={<span className="capa-previa-vazia">{sigla}</span>}
          onEnviar={async (f, p) => atualizarEmpresa(await enviarImagemEmpresa(empresa.id, 'capa', f, p))}
          onRemover={async () => atualizarEmpresa(await removerImagemEmpresa(empresa.id, 'capa'))} />

        <CampoImagem rotulo="Logo" url={empresa.logo_url} dica="Quadrada, de preferência com fundo. Aparece sobre a capa."
          vazio={<span className="logo-previa-vazia">{sigla}</span>}
          onEnviar={async (f, p) => atualizarEmpresa(await enviarImagemEmpresa(empresa.id, 'logo', f, p))}
          onRemover={async () => atualizarEmpresa(await removerImagemEmpresa(empresa.id, 'logo'))} />
      </div>
    </section>
  );
}
