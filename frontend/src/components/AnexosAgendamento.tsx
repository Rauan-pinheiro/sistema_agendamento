import { useMemo } from 'react';
import { confirmarAnexo, listAnexos, pedirAssinatura, removerAnexo } from '../api/anexos';
import { formatarBytes } from '../utils/midia';
import { GaleriaMidia, type AdaptadorGaleria } from './GaleriaMidia';

/** Fotos e vídeos privados de um agendamento (somente o dono). */
export function AnexosAgendamento({ agendamentoId, onTotalChange }: {
  agendamentoId: number;
  onTotalChange?: (total: number) => void;
}) {
  const adaptador = useMemo<AdaptadorGaleria>(() => ({
    async carregar() {
      const { anexos, cota } = await listAnexos(agendamentoId);
      return {
        itens: anexos.map((a) => ({ ...a, nome: a.nome_original })),
        maxArquivos: cota.max_arquivos,
        resumoCota: `${cota.arquivos}/${cota.max_arquivos} · ${formatarBytes(cota.bytes)} de ${formatarBytes(cota.max_bytes)}`,
      };
    },
    assinar: (arquivo, substituirId) => pedirAssinatura(agendamentoId, arquivo, substituirId),
    confirmar: (p) => confirmarAnexo(agendamentoId, p),
    remover: (id) => removerAnexo(agendamentoId, id),
    permiteSubstituir: true,
  }), [agendamentoId]);

  return <GaleriaMidia titulo="Fotos e vídeos" adaptador={adaptador} onTotalChange={onTotalChange} />;
}
