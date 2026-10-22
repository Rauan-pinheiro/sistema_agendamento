# 06 — Operação do dia a dia

Como manter o AgendaFácil funcionando depois do deploy (docs/05). Os endereços usam os nomes
padrão (`agenda-api.onrender.com`, `agenda-front.onrender.com`); troque pelos seus.

---

## 1. Rotina semanal (≈ 15 minutos, toda segunda-feira)

| # | O quê | Onde | Tudo certo se… | Se não estiver |
|---|---|---|---|---|
| 1 | **Erros da API** | Better Stack: busque `"status": 5` ou `"nivel": "ERROR"` nos últimos 7 dias | Nenhum, ou só casos isolados | Abra a linha, copie o `request_id` e veja a seção 4.3 |
| 2 | **Quedas** | UptimeRobot → Dashboard | 100% (ou perto) nos dois monitores | Veja os horários em **agenda-api → Events** e **Logs** |
| 3 | **Falhas de deploy e da rotina diária** | Render → e-mails de notificação; **agenda-rotina-midia → Events** | Todas as execuções "Succeeded" | Abra o log da execução que falhou. Se for o alerta de créditos, veja a seção 5 |
| 4 | **Uso do Cloudinary** | Cloudinary → **Dashboard** (créditos do mês) | Abaixo de 15 dos 25 créditos | Seção 5 (gatilhos) |
| 5 | **Desempenho** | **agenda-api → Metrics** (CPU, memória, tempo de resposta) | CPU < 70% e memória < 400 MB nos picos | Seção 5 |
| 6 | **Banda e custos** | Render → **Billing** | Banda do mês dentro dos 5 GB incluídos | Seção 5 |
| 7 | **Backup** | **agenda-db → Recovery → Create export** e baixe o arquivo | Arquivo baixado e guardado fora do Render | docs/05, seção 8 |

**Uma vez por mês:** teste a restauração de um backup (docs/05, 8.2) e rode `bash scripts/preflight.sh`
na sua máquina para ver se surgiram vulnerabilidades novas nas dependências (`pip-audit` e `npm audit`).

---

## 2. Clientes: ativar, suspender e encerrar

Tudo pelo **admin**: `https://agenda-api.onrender.com/<DJANGO_ADMIN_URL>` → **Empresas**. A lista
mostra a coluna **Ativa** e tem busca por nome, link, usuário, e-mail ou WhatsApp.

### 2.1 Novo cliente (ativar)
1. O cliente cria a conta sozinho em `https://agenda-front.onrender.com/register` (ou você cria junto
   com ele numa chamada). O cadastro grava o aceite dos Termos e a versão aceita.
2. Ajude na configuração inicial: **Serviços** (com fotos no "Ver mais"), **Horários** (um dia de cada
   vez, em **Adicionar dia**) e **Profissionais**, se houver equipe.
3. Ele copia o link em **Copiar link** (menu do painel) e coloca na bio do Instagram e no WhatsApp Business.
4. Combine a cobrança (por enquanto manual, Pix mensal) e anote a data de vencimento numa planilha.

### 2.2 Suspender (ex.: pagamento atrasado)
1. Admin → **Empresas** → marque a empresa → ação **"Suspender (bloqueia o painel e tira a página
   pública do ar)"** → **Ir**.
2. Efeito imediato: o dono não consegue entrar (quem já estava logado perde o acesso na próxima
   ação) e a página pública mostra "Página não encontrada". **Nenhum dado é apagado.**
3. Avise o cliente pelo WhatsApp **antes**, como dizem os Termos ("após aviso").

### 2.3 Reativar
Mesma tela → ação **"Reativar"**. Tudo volta como estava, incluindo os agendamentos.

### 2.4 Encerrar (cliente cancelou)
- O ideal é o próprio cliente usar **Configurações → Privacidade e dados → Baixar dados** e depois
  **Excluir conta**: apaga tudo, inclusive as fotos e vídeos no Cloudinary.
- Se ele pedir para você fazer: primeiro suspenda (2.2). Para apagar de vez, admin → **Usuários** →
  o usuário dono → **Excluir**. Isso remove a empresa e todos os dados e arquivos dela. **Não há como desfazer.**

---

## 3. Atender um cliente

### 3.1 Pedidos de LGPD (WhatsApp (88) 98868-4207)
A Política de Privacidade promete resposta em **até 15 dias**. Confirme que é a pessoa (veja a seção 3.2).

| Pedido | Quem | Como |
|---|---|---|
| Acesso / cópia dos dados | Dono da conta | Ele mesmo: **Configurações → Privacidade e dados → Baixar dados** |
| Correção | Dono | Ele mesmo, em **Configurações**. Ou você, pelo admin |
| Exclusão | Dono | Ele mesmo: **Excluir conta**. Ou você (2.4) |
| Qualquer pedido | Cliente final (quem agendou) | Encaminhe à empresa onde ele agendou: ela é a controladora e remove nome e telefone em **Configurações → Privacidade e dados → Remover dados de um cliente**. Se a empresa não responder, você pode fazer pelo admin (apagar os agendamentos daquele WhatsApp) |

Anote cada pedido (data, quem, o que foi feito) numa planilha: é a sua prova de atendimento.

### 3.2 Confirmar a identidade de um dono
Peça que escreva **do WhatsApp cadastrado** na empresa e informe o **usuário** e o **e-mail** da
conta. Confira no admin (**Empresas** → busque pelo WhatsApp). Não altere nada se não bater.

### 3.3 "Deu erro" (o cliente manda print)
Quando o servidor falha, a mensagem de erro termina com um **código** (ex.: `(código 5a9eadda9ea74ad7)`). No Better
Stack (ou em **agenda-api → Logs**), busque esse código: aparece a requisição e, se for erro 500, o
detalhe técnico logo abaixo. Mande para o desenvolvedor junto com o print.

### 3.4 Problemas comuns
| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Não aparece nenhum horário" | Dia sem horário cadastrado, ou já lotado | **Horários**: o dia precisa estar na lista. Com equipe, a grade pode ser por profissional |
| "O cliente não consegue escolher o profissional" | Profissional marcado como inativo | **Profissionais**: clique no status para ativar |
| "A página diz que não existe" | Link errado, ou conta suspensa | Confira o link em **Configurações**; no admin, veja a coluna **Ativa** |
| "Não consigo enviar foto" | Arquivo maior que 10 MB (vídeo: 100 MB) ou formato não aceito | Use JPG, PNG, WEBP, MP4 ou WEBM |
| "Muitas tentativas" ao entrar | Limite de 10 tentativas por minuto | Esperar 1 minuto |

---

## 4. Recuperar a senha de um dono (sem e-mail)

O sistema ainda não envia e-mail de "esqueci minha senha". Enquanto isso:

1. **Confirme a identidade** (3.2). Nunca troque senha a pedido de um número diferente do cadastrado.
2. Descubra o **usuário**: admin → **Empresas** → busque pelo nome ou WhatsApp → coluna **Owner**.
3. Gere uma senha temporária forte na sua máquina:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(9))"
   ```
4. Render → **agenda-api → Shell**:
   ```bash
   python manage.py changepassword NOME_DO_USUARIO
   ```
   Digite a senha temporária duas vezes.
5. Mande a senha temporária ao dono **pelo WhatsApp cadastrado** e peça que troque na hora em
   **Configurações → Alterar senha**.
6. Anote na planilha de atendimentos (data, usuário, motivo).

---

## 5. Quando subir de plano (gatilhos)

Confira na rotina semanal. Um gatilho isolado num pico não basta: suba quando acontecer por
**vários dias seguidos** nos horários de movimento.

| Gatilho | Onde ver | O que fazer |
|---|---|---|
| **CPU da API acima de 70%** | agenda-api → Metrics → CPU | Plano **Standard** da API (1 CPU, 2 GB). Mantenha `WEB_CONCURRENCY=1` e aumente `GUNICORN_THREADS` para 8. Para usar mais de um processo ou instância, antes é preciso mover cache e limites de requisição para um Redis (Render Key Value), porque hoje ficam na memória do processo |
| **Tempo de resposta p95 acima de 500 ms** | agenda-api → Metrics → Response Time (p95); ou Better Stack, campo `duracao_ms` | Se a CPU da API também estiver alta: subir a API. Se a CPU estiver baixa: o gargalo é o banco (próxima linha) |
| **Banco acima de 80%** (CPU, memória ou disco) | agenda-db → Metrics (CPU, memória) e **Info** (armazenamento usado) | Disco cheio: aumente o armazenamento (US$ 0,30/GB). CPU ou memória: plano **Basic 1 GB** do Postgres |
| **Cloudinary acima de 15 dos 25 créditos** | E-mail de falha da rotina diária (`verificar_uso_midia`) e o Dashboard do Cloudinary | Rode **agenda-rotina-midia → Trigger Run** (limpa órfãos). Se continuar subindo: reduza os limites `MIDIA_MAX_*`, assine o plano pago do Cloudinary ou migre para o Cloudflare R2 (o código já tem a interface pronta, `agendamentos/midia.py`) |
| Banda acima de 5 GB/mês | Render → Billing | Excedente custa US$ 0,15/GB. Se ficar caro, workspace **Pro** (inclui mais banda) |

> Preços e nomes de planos mudam: confirme no painel do Render antes de trocar. Trocar de plano é
> em **Settings → Instance Type** de cada serviço, sem perder dados (a API reinicia em ~1 minuto).

---

## 6. Referências rápidas

| Preciso… | Onde |
|---|---|
| Publicar uma nova versão | Merge na `main` (deploy automático). Antes: `bash scripts/preflight.sh` |
| Voltar uma versão | docs/05, seção 9 (Rollback) |
| Restaurar o banco | docs/05, seção 8.3 |
| Trocar a `SECRET_KEY` | docs/05, seção 11 |
| Entender uma variável de ambiente | `backend/.env.example` e `frontend/.env.example` |
