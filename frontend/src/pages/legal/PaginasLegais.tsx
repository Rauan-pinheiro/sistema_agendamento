import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Termos de Uso e Política de Privacidade.
 * ANTES DO GO-LIVE: preencha os dados do responsável abaixo e peça revisão jurídica.
 * Ao mudar o texto, atualize VERSAO aqui e TERMOS_VERSAO no back-end (settings.py).
 */
const RESPONSAVEL = {
  nome: '[Nome ou razão social]',
  documento: '[CPF ou CNPJ]',
  email: '[e-mail de contato]',
  foro: '[Cidade/UF]',
};
const VERSAO = '19 de outubro de 2026';
const PRODUTO = 'AgendaFácil';

function Documento({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="legal">
      <p className="legal-voltar"><Link to="/login">← {PRODUTO}</Link></p>
      <h1>{titulo}</h1>
      <p className="legal-versao">Versão de {VERSAO}</p>
      {children}
      <p className="legal-rodape">
        Dúvidas: <a href={`mailto:${RESPONSAVEL.email}`}>{RESPONSAVEL.email}</a> ·{' '}
        <Link to="/termos">Termos de Uso</Link> · <Link to="/privacidade">Política de Privacidade</Link>
      </p>
    </main>
  );
}

export function TermosPage() {
  return (
    <Documento titulo="Termos de Uso">
      <p>
        Estes termos regem o uso do {PRODUTO}, oferecido por {RESPONSAVEL.nome} ({RESPONSAVEL.documento}), por
        empresas e profissionais (“prestador”) que usam o sistema para receber agendamentos dos seus clientes.
      </p>

      <h2>1. O serviço</h2>
      <p>
        O {PRODUTO} oferece uma página pública de agendamento, um painel para gerenciar serviços, profissionais,
        horários e agendamentos, e relatórios financeiros simples. O serviço é fornecido pela internet, no estado em
        que se encontra, com melhorias contínuas.
      </p>

      <h2>2. Conta</h2>
      <p>
        Você é responsável pelas informações do cadastro, pela guarda da sua senha e por tudo o que for feito na sua
        conta. Avise-nos imediatamente se suspeitar de acesso indevido.
      </p>

      <h2>3. Assinatura e pagamento</h2>
      <p>
        O uso é por assinatura recorrente, mensal ou anual, nos valores informados no momento da contratação, sem
        taxa de implantação. A assinatura renova automaticamente até ser cancelada. Você pode cancelar a qualquer
        momento, sem multa; o acesso continua até o fim do período já pago. Valores podem ser reajustados com aviso
        prévio de 30 dias.
      </p>

      <h2>4. Suas responsabilidades</h2>
      <ul>
        <li>Usar o sistema apenas para fins lícitos e para agendar os seus próprios atendimentos.</li>
        <li>
          Tratar os dados dos seus clientes de acordo com a Lei Geral de Proteção de Dados (LGPD). Em relação a esses
          dados, você é o <strong>controlador</strong> e o {PRODUTO} atua como <strong>operador</strong>, seguindo suas
          instruções.
        </li>
        <li>Enviar apenas fotos e vídeos que você tenha direito de usar e que não violem a lei ou direitos de terceiros.</li>
      </ul>

      <h2>5. Limites de uso</h2>
      <p>
        Para manter o serviço estável, há limites técnicos, como tamanho de arquivos (imagens até 10 MB e vídeos até
        100 MB), quantidade de arquivos por agendamento e por serviço, e limites de requisições por minuto. Os limites
        vigentes são exibidos no próprio sistema.
      </p>

      <h2>6. Disponibilidade e backups</h2>
      <p>
        Empregamos esforços razoáveis para manter o serviço disponível e fazemos cópias de segurança do banco de dados.
        Podem ocorrer interrupções para manutenção ou por falhas de terceiros (hospedagem, internet).
      </p>

      <h2>7. Encerramento e seus dados</h2>
      <p>
        Você pode exportar todos os seus dados e excluir a sua conta a qualquer momento em <em>Configurações</em>. A
        exclusão remove definitivamente a empresa, os serviços, os profissionais, os agendamentos e os arquivos de
        mídia. Podemos suspender contas que violem estes termos ou com pagamento em atraso, após aviso.
      </p>

      <h2>8. Responsabilidade</h2>
      <p>
        O {PRODUTO} não se responsabiliza pela prestação dos serviços agendados, que é feita exclusivamente pelo
        prestador, nem por perdas indiretas. Nossa responsabilidade total fica limitada ao valor pago nos últimos 12
        meses, salvo o que a lei não permitir limitar.
      </p>

      <h2>9. Alterações e foro</h2>
      <p>
        Podemos atualizar estes termos; mudanças relevantes serão avisadas com antecedência. Fica eleito o foro de{' '}
        {RESPONSAVEL.foro}, salvo disposição legal em contrário.
      </p>
    </Documento>
  );
}

export function PrivacidadePage() {
  return (
    <Documento titulo="Política de Privacidade">
      <p>
        Esta política explica como o {PRODUTO} ({RESPONSAVEL.nome}, {RESPONSAVEL.documento}) trata dados pessoais, de
        acordo com a Lei nº 13.709/2018 (LGPD).
      </p>

      <h2>1. Quem trata os dados</h2>
      <ul>
        <li>
          <strong>Dados de quem tem conta</strong> (donos de empresa): o {PRODUTO} é o <strong>controlador</strong>.
        </li>
        <li>
          <strong>Dados de quem agenda</strong> (clientes finais): a empresa em que você agendou é a{' '}
          <strong>controladora</strong>; o {PRODUTO} é o <strong>operador</strong> e só trata esses dados para prestar
          o serviço a ela.
        </li>
      </ul>

      <h2>2. Dados coletados e finalidades</h2>
      <ul>
        <li>
          <strong>Conta:</strong> nome de usuário, e-mail, senha (guardada apenas como hash Argon2, nunca em texto),
          nome da empresa, link público e WhatsApp de contato. Finalidade: criar e operar a conta. Base legal:
          execução de contrato (art. 7º, V).
        </li>
        <li>
          <strong>Agendamentos:</strong> nome e WhatsApp do cliente, data, horário, serviços e profissional escolhidos,
          e fotos ou vídeos que a empresa anexar. Finalidade: realizar e organizar o atendimento. Base legal:
          execução de contrato ou procedimentos preliminares a pedido do titular (art. 7º, V).
        </li>
        <li>
          <strong>Dados técnicos:</strong> endereço IP, data e hora de acesso e páginas da API acessadas, em registros
          de segurança. Finalidade: prevenir fraudes e abusos e investigar falhas. Base legal: legítimo interesse
          (art. 7º, IX) e Marco Civil da Internet.
        </li>
      </ul>
      <p>Não vendemos dados, não fazemos publicidade direcionada e não usamos cookies de rastreamento.</p>

      <h2>3. Armazenamento no navegador</h2>
      <p>
        O navegador guarda apenas o necessário para o sistema funcionar: o token de acesso de quem fez login e a
        preferência de tema claro ou escuro. Nada disso é compartilhado com terceiros.
      </p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Somente com fornecedores necessários para operar o serviço, que seguem contratos de proteção de dados:</p>
      <ul>
        <li><strong>Render</strong> (hospedagem da aplicação e do banco de dados, nos Estados Unidos);</li>
        <li><strong>Cloudinary</strong> (armazenamento e entrega de fotos e vídeos, nos Estados Unidos);</li>
        <li><strong>YouTube</strong>, apenas quando um visitante escolhe reproduzir um vídeo da vitrine (modo de privacidade aprimorada).</li>
      </ul>
      <p>
        Essas transferências internacionais ocorrem com as garantias previstas no art. 33 da LGPD (cláusulas
        contratuais dos fornecedores). Também podemos fornecer dados quando exigido por lei ou ordem judicial.
      </p>

      <h2>5. Por quanto tempo</h2>
      <p>
        Dados da conta e dos agendamentos ficam guardados enquanto a conta existir e são apagados quando ela é
        excluída. Registros técnicos de acesso são mantidos pelo prazo legal de 6 meses. Cópias de segurança
        são sobrescritas automaticamente de acordo com a política do provedor do banco.
      </p>

      <h2>6. Seus direitos</h2>
      <p>
        Você pode pedir confirmação de tratamento, acesso, correção, portabilidade, anonimização ou exclusão dos seus
        dados, e informações sobre compartilhamento (art. 18 da LGPD):
      </p>
      <ul>
        <li>
          <strong>Donos de empresa:</strong> em <em>Configurações → Privacidade e dados</em> você exporta todos os dados
          da conta e pode excluí-la.
        </li>
        <li>
          <strong>Clientes finais:</strong> fale com a empresa em que agendou; ela consegue remover seu nome e telefone
          pelo painel. Se preferir, escreva para <a href={`mailto:${RESPONSAVEL.email}`}>{RESPONSAVEL.email}</a> e
          encaminharemos o pedido.
        </li>
      </ul>

      <h2>7. Segurança</h2>
      <p>
        Conexão criptografada (HTTPS), senhas com hash Argon2, isolamento entre empresas testado automaticamente,
        limites contra tentativas repetidas de login, fotos de agendamentos privadas (acessíveis só por links
        temporários assinados) e cópias de segurança do banco.
      </p>

      <h2>8. Contato do encarregado</h2>
      <p>
        Encarregado pelo tratamento de dados: {RESPONSAVEL.nome} — <a href={`mailto:${RESPONSAVEL.email}`}>{RESPONSAVEL.email}</a>.
        Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>
    </Documento>
  );
}
