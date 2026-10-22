# 05 — Deploy passo a passo (Render)

Para quem nunca publicou um sistema. Siga na ordem; cada passo diz **onde clicar** e **como
saber que deu certo**. Tempo total: umas 2 horas na primeira vez.

> Os preços e nomes de menus foram conferidos em outubro de 2026. Painéis mudam: se algo estiver
> diferente, procure o nome parecido. **Confirme os preços no painel do Render antes de pagar.**

---

## 0. Antes de começar

### 0.1 Contas necessárias

| Conta | Para quê | Custo |
|---|---|---|
| **GitHub** (já tem) | O Render publica o que está no repositório | Grátis |
| **Render** — <https://render.com> | Hospeda a API, o site, o banco e a rotina diária | Ver seção 10 (≈ US$ 14/mês) |
| **Cloudinary** — <https://cloudinary.com> | Guarda as fotos e vídeos | Grátis até 25 créditos/mês |
| **Better Stack** (ou outro de logs) — <https://betterstack.com> | Guardar os logs por 6 meses (Marco Civil) | Pago por uso; ver seção 10 |
| **UptimeRobot** — <https://uptimerobot.com> | Avisar se o sistema cair | Grátis |
| Domínio (opcional) — ex.: Registro.br | `agendafacil.com.br` em vez de `agenda-front.onrender.com` | ≈ R$ 40/ano |

Crie o Render entrando **com a conta do GitHub** (fica mais fácil dar acesso ao repositório).
Cadastre um cartão: os planos usados são pagos.

### 0.2 O código pronto na `main`

O Render vai publicar a branch `main`. As branches das fases estão **empilhadas** (cada uma parte
da anterior), então basta juntar a última:

1. No GitHub, abra o repositório → **Pull requests** → **New pull request**.
2. *base:* `main` ← *compare:* a branch mais recente (`fase-9-prontidao-final`). Ela contém todas as anteriores.
3. Confira a lista de commits e clique em **Create pull request** → **Merge pull request**.

Antes do merge, rode na sua máquina (Git Bash, na raiz do projeto):

```bash
bash scripts/preflight.sh
```

Só continue se terminar com **`OK: tudo pronto para o deploy.`**

### 0.3 Itens do código que dependem de você

- **Termos e Política:** revisados por um advogado? Se mudar algo, atualize `VERSAO` em
  `frontend/src/pages/legal/PaginasLegais.tsx` e `TERMOS_VERSAO` em `backend/config/settings.py`.
- **E-mail de contato (opcional):** troque `email: '[E-MAIL]'` na constante `RESPONSAVEL` do mesmo
  arquivo. Enquanto estiver assim, o e-mail não aparece no site.

---

## 1. Cloudinary (fotos e vídeos)

1. Crie a conta em <https://cloudinary.com> (plano **Free**).
2. No painel: **Settings** (engrenagem) → **API Keys**.
3. Copie o valor **API environment variable**. Ele tem este formato:
   `cloudinary://123456789012345:AbCdEf...@seu-cloud-name`
4. Guarde num lugar seguro (gerenciador de senhas). **Isso é um segredo:** nunca coloque no
   código, no GitHub ou em mensagens.

---

## 2. As variáveis de ambiente

São as configurações que o sistema lê ao iniciar. A maioria **já está no `render.yaml`**; você só
digita as marcadas como "você preenche". A lista completa, com explicação, está em
[`backend/.env.example`](../backend/.env.example) e [`frontend/.env.example`](../frontend/.env.example).

### Você preenche (o Render pergunta na criação)

| Serviço | Variável | Valor | Onde obter |
|---|---|---|---|
| agenda-api | `CORS_ALLOWED_ORIGINS` | `https://agenda-front.onrender.com` | Endereço do site (seção 3.3). Sem barra no fim |
| agenda-api | `CSRF_TRUSTED_ORIGINS` | `https://agenda-api.onrender.com` | Endereço da própria API |
| agenda-api | `DJANGO_ADMIN_URL` | ex.: `painel-7k2q9x/` | Invente um caminho difícil de adivinhar, **terminando com `/`**. Gere um com `python -c "import secrets; print('painel-' + secrets.token_hex(4) + '/')"` |
| agenda-api | `CLOUDINARY_URL` | `cloudinary://…` | Seção 1 |
| agenda-rotina-midia | `CLOUDINARY_URL` | o mesmo valor | Seção 1 |
| agenda-front | `VITE_API_URL` | `https://agenda-api.onrender.com` | Endereço da API (seção 3.3). Sem barra no fim |

### Já resolvidas pelo `render.yaml` (não mexa)

| Variável | O que é |
|---|---|
| `DJANGO_SECRET_KEY` | Chave criptográfica **gerada pelo Render** (seção 11) e compartilhada com a rotina diária |
| `DATABASE_URL` | Endereço do banco, ligado automaticamente ao `agenda-db` |
| `DJANGO_DEBUG=false` | Modo de produção |
| `DB_POOL=true` | Reaproveita conexões com o banco |
| `NUM_PROXIES=1` | Para os logs e o limite de tentativas usarem o IP real do cliente |
| `LOG_FORMATO=json` | Uma linha de log por requisição |
| `PYTHON_VERSION`, `NODE_VERSION` | Versões usadas no build |

As demais variáveis do `.env.example` têm valores padrão adequados e **não precisam** ser definidas.

---

## 3. Criar tudo no Render (Blueprint)

O `render.yaml` descreve os 4 recursos. O Render lê o arquivo e cria tudo de uma vez:

| Recurso | Tipo e plano |
|---|---|
| `agenda-db` | PostgreSQL 17, **Basic 256 MB**, região Virginia |
| `agenda-api` | Web Service Python, **Starter** (0,5 CPU, 512 MB) |
| `agenda-front` | Static Site (o React) |
| `agenda-rotina-midia` | Cron Job diário às 06:00 de Fortaleza |

### 3.1 Criar
1. No Render: **New +** → **Blueprint**.
2. Conecte o GitHub, se pedir, e escolha o repositório `sistema_agendamento`. Branch: **`main`**.
3. **Blueprint Name:** `agenda`.
4. O Render mostra a lista dos 4 recursos e **valida o arquivo**. Se aparecer erro aqui, não continue:
   rode `backend/venv/Scripts/python.exe scripts/validar_render_yaml.py` e me mostre a saída.
5. Preencha as variáveis pedidas (tabela da seção 2).
6. Clique em **Apply** (ou **Deploy Blueprint**).

### 3.2 Acompanhar
- O banco fica pronto em alguns minutos.
- A API faz o build (`pip install`), roda as **migrations** (`preDeployCommand`) e sobe. Em
  **agenda-api → Events**, espere **"Deploy live"**. Se falhar, abra **Logs**: a última linha vermelha diz o motivo.
- O site faz `npm ci && npm run build` e publica.

### 3.3 Conferir os endereços (importante)
O Render dá a cada serviço um endereço `https://<nome>.onrender.com`. **Se o nome já estiver em uso
por outra pessoa, ele acrescenta letras** (ex.: `agenda-api-x7k2.onrender.com`). Abra cada serviço e
veja o endereço no topo da página.

Se algum endereço for diferente do que você digitou na seção 2:
1. **agenda-api → Environment:** corrija `CORS_ALLOWED_ORIGINS` (endereço do site) e `CSRF_TRUSTED_ORIGINS`. Salve (a API reinicia).
2. **agenda-front → Environment:** corrija `VITE_API_URL` (endereço da API).
3. **No código**, em `render.yaml`, troque `https://agenda-api.onrender.com` no `connect-src` da
   `Content-Security-Policy` pelo endereço real da API. Faça commit e push na `main`: o site é
   publicado de novo sozinho (`autoDeploy`). **Sem isso, o site abre mas não consegue falar com a API.**
4. Se não mudou o código, em **agenda-front** clique em **Manual Deploy → Deploy latest commit**
   (o `VITE_API_URL` só vale depois de um novo build).

---

## 4. Verificação pós-deploy

Faça todos. Troque os endereços pelos seus.

### 4.1 Health check
```bash
curl https://agenda-api.onrender.com/api/v1/health/
```
Esperado: `{"status": "ok"}`. (No navegador também serve.)

### 4.2 Fluxo completo pelo celular
Use o **celular no 4G** (não no Wi-Fi do computador):
1. Abra `https://agenda-front.onrender.com/register`, crie uma conta de teste e aceite os termos.
2. **Serviços → Novo serviço** (ex.: "Corte", 30 min, R$ 40). Depois **Editar** e adicione uma **foto** e um **link do YouTube**.
3. **Horários → Adicionar dia** (pelo menos amanhã).
4. Abra a sua página pública (**Ver minha página** no menu), toque em **Ver mais** no serviço (a foto
   e o vídeo devem aparecer) e faça uma reserva para amanhã.
5. Volte ao painel: o agendamento aparece em **Pendentes**. Abra, **anexe uma foto** e **Confirme**.
6. **Configurações → Privacidade e dados → Baixar dados** (baixa um JSON).
7. No fim, **Excluir conta** (pede a senha) para não deixar a conta de teste.

Se algo falhar, abra o site no computador, aperte **F12 → Console** e veja a mensagem em vermelho.
`Refused to connect … Content Security Policy` = falta o passo 3.3.3.

### 4.3 IPs reais nos logs
1. Enquanto usa o celular no 4G, abra **agenda-api → Logs**.
2. Cada linha de requisição tem um campo `"ip"`. Faça mais algumas requisições pelo computador (outra rede).
3. **Esperado:** IPs **diferentes** para o celular e o computador, e iguais ao que aparece em
   <https://meuip.com.br> em cada aparelho.
4. **Se todos os IPs forem iguais** (o do proxy do Render), o limite de tentativas de login
   bloquearia todo mundo junto. Copie uma linha de log e peça ajuda **antes** de mexer em
   `NUM_PROXIES`: um valor alto demais deixa qualquer pessoa falsificar o próprio IP.

### 4.4 Cache do site
```bash
curl -sI https://agenda-front.onrender.com/ | grep -i cache-control
curl -sI https://agenda-front.onrender.com/dashboard | grep -i cache-control
```
Esperado: `no-cache` (ou `max-age=0`). Se não aparecer nada ou aparecer um `max-age` grande,
navegadores podem continuar com a versão antiga do site depois de um deploy. Correção: no
`render.yaml`, no `agenda-front`, adicione um header `path: /*`, `name: Cache-Control`,
`value: no-cache` **antes** da regra de `/assets/*` e confira de novo que `/assets/...` continua `immutable`.

### 4.5 Rotina diária
**agenda-rotina-midia → Trigger Run.** Nos logs deve aparecer
`0 arquivo(s) órfão(s) removidos.` e `Créditos usados: … Abaixo do alerta de 15 créditos.`
Se der erro de Cloudinary, confira a `CLOUDINARY_URL` **deste** serviço.

### 4.6 Medir a velocidade real (opcional, antes dos clientes reais)
O teste de carga local (docs/04) não inclui a distância Brasil ↔ EUA. Para medir em produção,
**antes de ter clientes**, peça ajuda: envolve criar dados de teste com
`python manage.py popular_carga --forcar`, folgar temporariamente os limites `LIMITE_*` e depois
apagar tudo com `python manage.py popular_carga --empresas 0 --forcar`.

---

## 5. Criar o superusuário (acesso ao admin)

1. **agenda-api → Shell** (aba no menu do serviço).
2. Digite `python manage.py createsuperuser` e responda usuário, e-mail e senha (forte e única).
3. Acesse `https://agenda-api.onrender.com/<DJANGO_ADMIN_URL>` (o caminho que você inventou).
   `/admin/` dá 404 de propósito.

O admin serve para emergências (ver e corrigir dados, desativar uma conta). O dia a dia está no docs/06.

---

## 6. Logs por 6 meses (log drain)

O Marco Civil da Internet (art. 15) exige guardar registros de acesso (IP, data e hora) por **6
meses**. O Render guarda os logs por poucos dias, então é preciso mandá-los para outro serviço.
Exemplo com o **Better Stack** (outros, como Papertrail, funcionam igual):

1. No Better Stack: **Telemetry → Sources → Connect source**, plataforma **Render** (ou "Syslog").
   Ele mostra um **endereço** (`host:porta`) e um **token**.
2. **Configure a retenção da fonte para pelo menos 180 dias.** Essa é a parte que custa: o plano
   grátis guarda só alguns dias. Confira o preço no Better Stack (seção 10).
3. No Render: na página inicial do workspace, **Integrations → Observability → Log Streams →
   Default destination → + Set default**. Cole o endereço em **Log Endpoint** e o token em **Token**. **Save Changes**.
4. Abra o site, aguarde 1 minuto e confira que as linhas chegam no Better Stack com o campo `ip`.

Dica: no plano Hobby do Render, o destino padrão vale para todos os serviços, o que é o que queremos.

---

## 7. Monitor de disponibilidade (uptime)

No UptimeRobot (grátis): **+ New monitor**, dois monitores de 5 em 5 minutos:

| Tipo | URL | Detalhe |
|---|---|---|
| **Keyword** | `https://agenda-api.onrender.com/api/v1/health/` | Palavra-chave `ok`. Pega API e banco fora do ar |
| **HTTP(s)** | `https://agenda-front.onrender.com/` | O site abre |

Em **Alert contacts**, coloque seu e-mail e, se quiser, o app do UptimeRobot no celular.
O Render também manda e-mail quando um deploy ou a rotina diária falham: deixe ligado em
**Account Settings → Notifications**.

---

## 8. Primeiro backup e teste de restauração

O Render faz **recuperação para qualquer ponto dos últimos 3 dias** (plano Hobby) automaticamente.
Como garantia extra, faça uma cópia **semanal** guardada fora do Render, e **teste uma vez** que ela restaura.

### 8.1 Fazer o backup
1. **agenda-db → Recovery → Create export.** Espere terminar (alguns minutos).
2. Clique para baixar. Vem um arquivo `….dir.tar.gz`. O Render guarda por 7 dias; **você** guarda
   o arquivo (ex.: Google Drive numa pasta privada). **Ele contém dados pessoais**: não compartilhe.

### 8.2 Testar a restauração (no seu computador, com o Docker ligado)
No Git Bash, na pasta onde está o arquivo:
```bash
mkdir restauracao && tar -xzf NOME-DO-ARQUIVO.dir.tar.gz -C restauracao
find restauracao -name toc.dat                  # mostra a pasta do backup, ex.: restauracao/xyz/agenda
docker run -d --name teste-restauracao -e POSTGRES_PASSWORD=teste postgres:17-alpine
sleep 5
docker cp restauracao/CAMINHO-DA-PASTA-DO-toc.dat teste-restauracao:/backup
docker exec teste-restauracao createdb -U postgres agenda
docker exec teste-restauracao pg_restore -U postgres -d agenda --no-owner --no-acl /backup
docker exec teste-restauracao psql -U postgres -d agenda -c "SELECT count(*) AS empresas FROM agendamentos_empresa;" -c "SELECT count(*) AS agendamentos FROM agendamentos_agendamento;"
docker rm -f teste-restauracao && rm -rf restauracao
```
**Deu certo** se as contagens baterem com o que você vê no sistema. Anote a data do teste.

### 8.3 Se um dia precisar restaurar de verdade
Prefira a **recuperação para um ponto no tempo**: **agenda-db → Recovery → Restore Database**,
escolha o horário de antes do problema. O Render cria um **banco novo**; confira os dados e depois
troque a `DATABASE_URL` da `agenda-api` e da `agenda-rotina-midia` para ele. Na dúvida, peça ajuda
antes de apagar qualquer banco.

---

## 9. Rollback (voltar para a versão anterior)

Um deploy quebrou algo:

1. **agenda-api → Events** (ou **Deploys**): encontre o último deploy que funcionava → **Rollback**.
   Faça o mesmo no **agenda-front** se o problema for no site.
2. O site e a API voltam em 1–2 minutos. O `autoDeploy` continua ligado: o próximo push publica de
   novo, então **corrija o código** (ou faça `git revert` do commit) antes de enviar outro.
3. **Banco:** o rollback **não desfaz migrations**. As migrations deste projeto só **acrescentam**
   colunas e tabelas, então a versão anterior do código continua funcionando com o banco novo. Se
   uma migration estragar dados, use a recuperação para um ponto no tempo (8.3).

---

## 10. Custos esperados por mês

> ⚠️ Valores pesquisados em outubro de 2026, em dólar. **Confirme no painel do Render (Billing) e
> no site de cada serviço antes de assinar.** O Render mudou os planos em agosto de 2026.

| Item | Plano | Custo/mês |
|---|---|---|
| API (`agenda-api`) | Web Service **Starter** | US$ 7,00 |
| Banco (`agenda-db`) | Postgres **Basic 256 MB** | US$ 6,00 |
| Armazenamento do banco | US$ 0,30 por GB (começa com 1 GB) | ≈ US$ 0,30 |
| Site (`agenda-front`) | Static Site | US$ 0 |
| Rotina diária | Cron Job Starter, ≈ 1 min/dia a US$ 0,00016/min | < US$ 0,01 |
| Workspace | **Hobby** (inclui **5 GB** de banda por mês; excedente US$ 0,15/GB) | US$ 0 |
| Cloudinary | Free (25 créditos/mês) | US$ 0 |
| Logs por 6 meses | Better Stack, cobrança por volume | ≈ US$ 1–5 (estimativa; confira) |
| UptimeRobot | Free | US$ 0 |
| **Total** | | **≈ US$ 14–19/mês** (≈ R$ 80–110) |
| Domínio (opcional) | `.com.br` no Registro.br | ≈ R$ 40/ano |

**Banda:** as fotos e vídeos saem do Cloudinary, não do Render. O site (≈ 300 KB por primeira
visita, depois em cache) e a API cabem nos 5 GB para os primeiros clientes. Acompanhe em
**Billing** (docs/06).

---

## 11. A `SECRET_KEY`

É a chave que **assina** os tokens de login (JWT), os links temporários das fotos privadas e os
formulários do admin. Quem conhece a chave consegue **se passar por qualquer usuário**.

- **No Render ela é gerada automaticamente** (`generateValue: true` no `render.yaml`): você não precisa fazer nada.
- **Nunca reutilize a chave antiga do histórico do git** (`django-insecure-…`). Ela foi commitada no
  início do projeto, e qualquer pessoa com acesso ao repositório (ou a uma cópia antiga dele) a
  conhece. A API **se recusa a subir** em produção com chaves `django-insecure` ou com menos de 40 caracteres.
- **Gerar uma chave manualmente** (ex.: para rodar o modo de produção na sua máquina):
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(64))"
  ```
- **Trocar a chave** (se suspeitar de vazamento): **agenda-api → Environment →
  `DJANGO_SECRET_KEY` → Generate** (ou cole uma nova) → salvar. A rotina diária recebe a mesma chave
  automaticamente. Efeito: **todos são deslogados** e precisam entrar de novo; nenhum dado se perde.

---

## 12. Domínio próprio (opcional, pode ser depois)

1. Compre o domínio (ex.: `agendafacil.com.br`).
2. **agenda-front → Settings → Custom Domains → Add:** `agendafacil.com.br` (e `www.`).
   **agenda-api → Custom Domains → Add:** `api.agendafacil.com.br`. O Render mostra os registros
   DNS para criar no painel do domínio. O HTTPS é automático.
3. Atualize as variáveis:
   - agenda-api: `CORS_ALLOWED_ORIGINS=https://agendafacil.com.br`,
     `CSRF_TRUSTED_ORIGINS=https://api.agendafacil.com.br` e
     **`DJANGO_ALLOWED_HOSTS=api.agendafacil.com.br`** (sem isso a API responde "Bad Request (400)" no domínio novo);
   - agenda-front: `VITE_API_URL=https://api.agendafacil.com.br`;
   - `render.yaml`: `connect-src` da CSP com o domínio novo da API. Commit e push.
4. Refaça a verificação da seção 4 e troque as URLs no UptimeRobot.

---

## Resumo: ordem dos passos

1. Rodar `bash scripts/preflight.sh` (0.2) e fazer o merge na `main`.
2. Criar a conta no Cloudinary e copiar a `CLOUDINARY_URL` (1).
3. Render → New → Blueprint, preencher as variáveis (2 e 3).
4. Conferir os endereços e corrigir CORS, `VITE_API_URL` e CSP se mudaram (3.3).
5. Verificação pós-deploy (4).
6. Superusuário (5), log drain (6), monitor (7), primeiro backup e teste de restauração (8).
