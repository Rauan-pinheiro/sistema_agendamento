import type { Agendamento } from '../types';
import { formatPhone } from './phone';

/** Mensagens de WhatsApp do painel (confirmação para o cliente). */
function formatPreco(preco: string) {
  return parseFloat(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatWhatsapp(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function displayPhone(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return formatPhone(local);
}

export function buildWhatsappUrl(ag: Agendamento, empresaNome: string): string {
  const data = new Date(ag.data_hora);
  const dataFormatada = data.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const horario = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const preco = formatPreco(ag.preco_total);
  const nomesServicos = ag.servicos_info?.length
    ? ag.servicos_info.map((s) => s.nome).join(', ')
    : (ag.servico_nome ?? '—');

  const linhas = [
    `*Agendamento Confirmado!*`,
    ``,
    `Olá, *${ag.nome_cliente}*! Tudo certo para o seu horário.`,
    ``,
    `*Detalhes do seu agendamento:*`,
    `*Serviço:* ${nomesServicos}`,
    ...(ag.profissional_nome ? [`*Profissional:* ${ag.profissional_nome}`] : []),
    `*Data:* ${dataFormatada}`,
    `*Horário:* ${horario}`,
    `*Valor:* ${preco}`,
    ``,
    `_Em caso de imprevisto, avise com antecedência._`,
    ``,
    `Te esperamos!`,
    ...(empresaNome ? [`_— ${empresaNome}_`] : []),
  ];

  return `https://wa.me/${formatWhatsapp(ag.whatsapp_cliente)}?text=${encodeURIComponent(linhas.join('\n'))}`;
}

export function openWhatsApp(url: string) {
  window.open(url, 'whatsapp_panel');
}
