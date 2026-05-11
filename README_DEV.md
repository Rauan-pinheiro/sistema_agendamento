# Projeto: SaaS de Agendamento Multi-Tenant

## 1. Visão Geral
Sistema SaaS focado em prestadores de serviços (barbearias, clínicas, etc.). Cada assinante possui um ambiente isolado para gestão de horários, serviços e clientes, além de uma página pública acessada via slug para receber agendamentos de clientes finais.

## 2. Arquitetura e Stack
- **Backend:** Python / Django + Django Rest Framework
- **Banco de Dados:** SQLite (desenvolvimento) → MySQL via Cloud SQL (produção)
- **Frontend:** React + TypeScript + Vite — consome a API REST via Axios com interceptor JWT; build servido pelo próprio Django via WhiteNoise (sem serviço de frontend separado)
- **Infra:** Google Cloud Platform (GCP), região `southamerica-east1` (São Paulo) — elimina latência para usuários brasileiros
- **Containerização:** Docker — `Dockerfile` para o backend e `docker-compose.yml` para desenvolvimento local; obrigatório para deploy no Cloud Run
- **Estratégia de Produto:** Web-First (mobile e desktop em planos futuros)

### Por que GCP em vez de Railway + Vercel
Railway não possui região no Brasil — cada chamada de API percorreria ~180–250 ms de ida e volta (Brasil → EUA → Brasil). Com Cloud Run em São Paulo, backend, banco e frontend ficam na mesma região, eliminando essa latência. O React build é servido pelo Django com WhiteNoise, mantendo tudo em um único serviço sem custo de CDN separado no early-stage.

### Arquitetura de produção
```
Usuário (Brasil)
    ↓
Cloud Run — Django + WhiteNoise (serve React build + API REST)
    ↓
Cloud SQL — MySQL (mesma região southamerica-east1)
```

## 3. Estrutura Multi-Tenant (Isolamento de Dados)
- Estratégia: **Shared Database, Isolated Rows** (isolamento via chave estrangeira).
- `Empresa` é o Tenant. Todo model de negócio herda de `BaseModel`, que carrega uma `ForeignKey` obrigatória para `Empresa`.
- Cada empresa possui um `slug` único que gera sua página pública de agendamentos.
- O isolamento é aplicado nas views: `get_queryset` sempre filtra por `empresa=request.user.empresa`, garantindo que um prestador nunca acesse dados de outro.

## 4. Models (App: agendamentos)

| Model | Campos principais | Herda de |
|---|---|---|
| `Empresa` | `owner` (User), `nome_fantasia`, `slug`, `whatsapp_contato` | `Model` |
| `BaseModel` | `empresa` (FK), `criado_em`, `atualizado_em` | `Model` (abstract) |
| `Servico` | `nome`, `duracao_min`, `preco` | `BaseModel` |
| `Agendamento` | `servico`, `nome_cliente`, `whatsapp_cliente`, `data_hora`, `status` | `BaseModel` |
| `HorarioFuncionamento` | `dia_semana` (0–6), `hora_inicio`, `hora_fim`, `intervalo_min` | `BaseModel` |

> `HorarioFuncionamento` tem `unique_together = ['empresa', 'dia_semana']` — máximo de um horário por dia por empresa.

## 5. API REST — Endpoints

### Autenticação JWT
| Método | Rota | Descrição |
|---|---|---|
| POST | `api/v1/auth/token/` | Login — retorna `access` (60 min) e `refresh` (7 dias) |
| POST | `api/v1/auth/token/refresh/` | Renova o `access` token usando o `refresh` |
| POST | `api/v1/auth/registro/` | Cria User + Empresa atomicamente e retorna tokens JWT |

### Área privada (requer `Authorization: Bearer <token>`)
| Método | Rota | Descrição |
|---|---|---|
| GET / PATCH | `api/v1/empresa/` | Dados da empresa do usuário logado |
| GET / POST | `api/v1/servicos/` | Listar (paginado) e criar serviços |
| GET / PUT / PATCH / DELETE | `api/v1/servicos/{id}/` | Gerenciar um serviço |
| GET / POST | `api/v1/agendamentos/` | Listar (paginado, `?status=pendente`) e criar agendamentos |
| GET / PUT / PATCH / DELETE | `api/v1/agendamentos/{id}/` | Gerenciar um agendamento |
| PATCH | `api/v1/agendamentos/{id}/status/` | Confirmar ou cancelar um agendamento |
| GET / POST | `api/v1/horarios/` | Listar e criar horários de funcionamento |
| GET / PUT / PATCH / DELETE | `api/v1/horarios/{id}/` | Gerenciar um horário de funcionamento |

### Área pública (sem autenticação, via slug)
| Método | Rota | Descrição |
|---|---|---|
| GET | `api/v1/public/{slug}/` | Info da empresa (nome, slug, whatsapp) |
| GET | `api/v1/public/{slug}/servicos/` | Serviços disponíveis da empresa (paginado) |
| POST | `api/v1/public/{slug}/agendamentos/` | Cliente cria um agendamento |
| GET | `api/v1/public/{slug}/horarios-disponiveis/?data=YYYY-MM-DD[&servico_id=N]` | Retorna slots livres do dia; inclui `fechado: true` quando o dia não tem horário cadastrado |

> **Paginação:** as listagens de serviços, agendamentos e horários retornam `{ count, next, previous, results: [...] }` com `page_size=20` padrão. O cliente pode passar `?page_size=N` (máx 100) e `?page=N`.
> `GET /api/v1/empresa/` é uma **exceção**: retorna lista simples `[{...}]` sem envelope de paginação, pois um usuário sempre tem exatamente uma empresa (`pagination_class = None` no `EmpresaViewSet`).

## 6. Fluxos de Usuário

### Prestador (dashboard)
1. Registra conta via `/register` — cria User + Empresa num único POST.
2. Faz login em `/login` — recebe tokens JWT armazenados no localStorage.
3. No dashboard (`/dashboard`):
   - **Agendamentos:** visualiza por aba (Hoje / Todos / Pendentes / Confirmados / Cancelados); a aba "Hoje" é a padrão ao abrir; lista atualiza automaticamente a cada 30s sem recarregar a página; confirma, cancela ou exclui agendamentos (exclusão com confirmação inline); envia mensagem de confirmação pré-formatada via WhatsApp com um clique.
   - **Serviços:** cria, edita e exclui serviços com nome, duração e preço.
   - **Horários:** cadastra os dias da semana e faixas de atendimento (ex: Seg–Sex 08–18h, Sáb 08–13h) com o intervalo de slots desejado.

### Cliente (página pública)
1. Acessa `/{slug}` sem login.
2. **Passo 1:** vê os cards de serviços e seleciona um.
3. **Passo 2:** escolhe a data num seletor; a interface busca os slots disponíveis via API e exibe botões de horário — slots já ocupados aparecem riscados e desabilitados.
4. **Passo 3:** preenche nome e WhatsApp e confirma o agendamento.

## 7. O que foi implementado

### Backend
- [x] Models `Empresa`, `BaseModel`, `Servico`, `Agendamento` e `HorarioFuncionamento`
- [x] `Serializers` com validação de integridade (serviço pertence à empresa) e sobreposição de horário
- [x] `ViewSets` com isolamento de Tenant por `get_queryset` e injeção de empresa via `perform_create`
- [x] Roteamento com `DefaultRouter` (rotas privadas) + `path()` manual (rotas públicas com slug)
- [x] Migrations geradas e aplicadas (`0001_initial`, `0002_horariofuncionamento`)
- [x] Script `seed.py` para popular o banco em desenvolvimento
- [x] Autenticação JWT com `djangorestframework-simplejwt` — login, refresh e uso do token
- [x] Endpoint de registro de Empresa + criação automática do User vinculado
- [x] Alteração de status do Agendamento pelo prestador (`confirmado` / `cancelado`)
- [x] Regra de negócio: impedir agendamentos em horários já ocupados (validação de sobreposição no serializer, cobre rotas privada e pública)
- [x] Endpoint público de info da empresa (`GET /api/v1/public/{slug}/`)
- [x] Campo `servico_nome` (read-only) no `AgendamentoSerializer` — evita chamadas extras no frontend
- [x] Ordenação padrão dos agendamentos por `data_hora` ascendente
- [x] CORS configurado (`django-cors-headers`, origem `http://localhost:5173`)
- [x] Paginação global (`PageNumberPagination`, `page_size=20`, suporte a `?page_size` e `?page`) — `EmpresaViewSet` explicitamente excluído (`pagination_class = None`) pois sempre retorna exatamente 1 registro
- [x] CRUD de `HorarioFuncionamento` — endpoint privado completo
- [x] Endpoint público de slots disponíveis — cruza horários de funcionamento com agendamentos existentes, considera duração do serviço selecionado
- [x] Campo `servico_preco` (read-only) no `AgendamentoSerializer` — mesmo padrão de `servico_nome`; evita chamada extra ao endpoint de serviços só para exibir o preço na lista e na mensagem WhatsApp

### Frontend
- [x] Setup React + TypeScript + Vite com Axios e interceptor automático de JWT (refresh em fila)
- [x] `AuthContext` com estado de autenticação, login, registro e logout persistidos em localStorage
- [x] Roteamento com `react-router-dom`: rotas públicas, privadas (`PrivateRoute`) e dashboard aninhado
- [x] Página de Login e Registro (com geração automática de slug a partir do nome)
- [x] Dashboard layout com sidebar responsiva (empresa, slug público, navegação, logout)
- [x] Página de Agendamentos com abas por status e ações de confirmar/cancelar
- [x] Página de Serviços com tabela, modal de criação/edição e exclusão com confirmação
- [x] Página de Horários — cadastro dos dias e faixas de atendimento com modal de criação/edição
- [x] Página pública do cliente com fluxo em 3 passos: selecionar serviço → escolher data e slot → preencher dados
- [x] Slots ocupados exibidos desabilitados e riscados; apenas slots com espaço suficiente para o serviço são exibidos
- [x] Correção das chamadas de API para consumir o envelope paginado (`results`)
- [x] Sistema de tipos TypeScript completo (`Empresa`, `Servico`, `Agendamento`, `HorarioFuncionamento`, `SlotDisponivel`, `PaginatedResponse<T>`)
- [x] `AuthContext` resiliente a localStorage corrompido — `parseEmpresa()` protege contra `JSON.parse("undefined")` que derrubava o app inteiro com página em branco
- [x] Botão "Copiar link" na sidebar do dashboard — componente isolado `CopyLinkButton` (estado próprio, não re-renderiza o layout pai); copia `{origin}/{slug}` via `navigator.clipboard`; feedback visual "Copiado!" por 2 segundos; ícones `Copy`/`Check` sempre presentes no DOM, visibilidade controlada por CSS (`.icon-default`/`.icon-copied`) para evitar mutação de DOM que causava `insertBefore` crash — ver armadilha na seção 8
- [x] Mensagem de dia fechado na página pública — ao selecionar uma data sem horário cadastrado, exibe card vermelho com "{empresa.nome_fantasia} não atende em {dia, data}. Por favor, escolha outra data disponível para agendar." — diferencia claramente de "Nenhum horário disponível neste dia." (reservado para quando o dia tem horário mas todos os slots estão ocupados); estado `loadingSlots` corretamente zerado no early return do `useEffect` para evitar indicador de carregamento preso ao trocar de serviço — ver armadilha na seção 8
- [x] Cliente axios separado para rotas públicas (`publicApi` em `api/public.ts`) — rotas públicas não devem usar o cliente autenticado; se o token JWT estivesse expirado, o interceptor de 401 do cliente privado chamava `window.location.href = '/login'` e limpava o `localStorage`, derrubando a sessão do dashboard e deixando a página pública em branco
- [x] Slots passados ocultados para a data de hoje (backend) — `HorariosDisponiveisView` agora ignora qualquer slot cujo `slot_datetime < timezone.now()`; slots anteriores ao momento presente não são incluídos na resposta, independentemente de terem agendamento ou não
- [x] Aba "Hoje" na página de Agendamentos — primeira aba e padrão ao abrir o dashboard; busca todos os agendamentos e filtra pela data atual via `isToday()` no frontend, sem chamada extra à API
- [x] Polling silencioso na página de Agendamentos — `setInterval` de 30s atualiza a lista sem exibir spinner; pausa quando a aba do browser está em segundo plano (`document.hidden`); indicador discreto "atualizando..." no cabeçalho durante o refresh; intervalo único criado na montagem do componente via padrão `useRef` para evitar stale closure — ver seção 8
- [x] Botão "WhatsApp" nos cards de agendamento — aparece nos status `pendente` e `confirmado`; mensagem pré-formatada em pt-BR com nome do cliente, serviço, data completa (dia da semana + DD/MM/YYYY), horário e valor em BRL; mensagem codificada via `encodeURIComponent` (UTF-8 percent-encoding padrão, emojis incluídos); reutiliza a mesma janela do browser com `window.open(url, 'whatsapp_panel')` — ver seção 8
- [x] Exclusão de agendamento com confirmação inline — botão "Excluir" (ghost, discreto) disponível em todos os cards independente de status; ao clicar, substitui o botão pela confirmação diretamente no card ("Excluir permanentemente? / Sim, excluir / Não") sem abrir modal; ao trocar de aba, qualquer confirmação pendente é descartada automaticamente (`setConfirmDeleteId(null)` no `useEffect` de `tab`)

## 8. Decisões técnicas e armadilhas conhecidas

| Contexto | Decisão / Problema | Solução adotada |
|---|---|---|
| Paginação global + `EmpresaViewSet` | `DEFAULT_PAGINATION_CLASS` no `settings.py` envolve **todos** os ViewSets no envelope `{ count, results }`. Como `getMinhaEmpresa()` fazia `data[0]` esperando uma lista simples, `empresa.slug` virava `undefined` e o link da sidebar gerava `/undefined` | `EmpresaViewSet` recebe `pagination_class = None` explicitamente, pois um usuário sempre tem exatamente 1 empresa. A regra geral: qualquer endpoint que retorna um único objeto ou uma lista de tamanho fixo deve sobrescrever `pagination_class = None` |
| Slots disponíveis sem serviço selecionado | O endpoint `horarios-disponiveis` pode ser chamado sem `?servico_id` | Quando sem `servico_id`, usa `intervalo_min` do horário como duração padrão do slot |
| Fuso horário nos slots | `HorarioFuncionamento` armazena `hora_inicio`/`hora_fim` como `TimeField` (naive). Agendamentos são `DateTimeField` armazenados em UTC | Slots gerados com `timezone.make_aware(..., get_current_timezone())` e a comparação de conflitos é feita entre `aware datetimes`, evitando erros de offset |
| localStorage corrompido → página em branco | `getMinhaEmpresa()` retornava `undefined` quando a paginação quebrou o `data[0]`. `JSON.stringify(undefined)` grava a string literal `"undefined"` no localStorage. Na próxima inicialização, `JSON.parse("undefined")` lança `SyntaxError` dentro do `AuthProvider`, derrubando o React tree inteiro antes de qualquer rota renderizar | `parseEmpresa()` no `AuthContext` verifica a string `"undefined"`, valida que o objeto tem `slug`, e envolve o parse em `try/catch` — o app nunca trava por estado persistido inválido |
| Rotas públicas usando cliente autenticado | `api/public.ts` importava o mesmo `api` do `client.ts`, que injeta `Authorization: Bearer` em toda requisição e, em caso de 401 (token expirado), executa `window.location.href = '/login'` + `localStorage.clear()`. Ao abrir a página pública com token expirado, o interceptor derrubava a sessão inteira e a página ficava em branco | Criado `publicApi` — instância axios limpa (`axios.create`) sem interceptors de auth em `api/public.ts`; o cliente privado (`client.ts`) permanece inalterado e exclusivo para rotas autenticadas |
| Botão "Copiar link" → `insertBefore` / página em branco (React 19 + React Router 7) | Dois bugs encadeados. **1)** Estado `copied` no `DashboardLayout` re-renderizava o `<Outlet />` inteiro a cada clique, causando página em branco. **2)** Alternar condicionalmente entre `<Copy>` e `<Check>` na mesma posição da árvore JSX faz o reconciliador chamar `insertBefore(parent, newNode, referenceNode)` onde `referenceNode` deixou de ser filho do pai durante a fase de commit → `Uncaught NotFoundError` | **1)** Extraído `CopyLinkButton` como componente próprio — mudanças de estado não atingem o layout pai. **2)** Ambos os ícones (`Copy` e `Check`) são sempre renderizados no DOM; CSS com classes `.icon-default`/`.icon-copied` controla a visibilidade via `display: none` baseado no modificador `.sidebar-copy-btn--copied`. Nenhum nó DOM é inserido ou removido ao clicar — o reconciliador não é acionado para o ícone |
| Seleção de data sem horário cadastrado → mensagem genérica + loading preso | **1)** Backend retornava `{ slots: [] }` quando não existe `HorarioFuncionamento` para o `dia_semana` — idêntico ao retorno de dia com todos os slots ocupados. Frontend não distinguia e exibia "Nenhum horário disponível" para ambos. **2)** O `useEffect` de busca de slots não resetava `loadingSlots` no early return (quando `dataSelecionada` é limpa ao trocar de serviço). Se o usuário trocasse de serviço com uma requisição em andamento, o indicador de carregamento ficava preso na tela | **1)** `HorariosDisponiveisView` retorna `'fechado': True` no JSON quando `DoesNotExist`. Frontend lê `r.fechado`, armazena em `diaClosed` e exibe card vermelho com nome da empresa e data específica: _"{empresa} não atende em {dia, data}. Por favor, escolha outra data disponível para agendar."_ **2)** Early return do `useEffect` agora chama `setLoadingSlots(false)` e `setDiaClosed(false)` antes de retornar |
| Slots passados exibidos como disponíveis para a data de hoje | `HorariosDisponiveisView` gerava todos os slots do `HorarioFuncionamento` e descartava apenas os ocupados por `Agendamento`. Não comparava com a hora atual — ao selecionar hoje, slots do passado (ex: 08:00 às 14:36) apareciam disponíveis | Na construção da lista de slots, `agora = timezone.now()` é capturado uma vez antes do loop; qualquer `slot_datetime < agora` é ignorado com `continue`, sem entrar na verificação de conflitos nem ser adicionado à resposta |
| Polling com stale closure → atualização só no filtro "Todos" | O `setInterval` do polling tinha `[fetchData]` como dependência do `useEffect`. Toda vez que o usuário trocava de aba, `fetchData` era recriado (novo `useCallback`), o intervalo era destruído e recriado do zero — resetando os 30s. Além disso, a versão capturada de `fetchData` dentro do intervalo ficava desatualizada (stale closure), fazendo o poll sempre usar o filtro da aba inicial (`'todos'`) | Padrão `useRef`: `fetchDataRef` guarda sempre a referência mais recente de `fetchData` (atualizado via `useEffect` a cada mudança de `tab`). O `setInterval` é criado **uma única vez** na montagem com deps `[]` e lê `fetchDataRef.current` a cada tick — sem stale closure e sem reset do intervalo ao trocar de aba |
| Emojis renderizados como losango+`?` na mensagem do WhatsApp | A abordagem anterior (`encodeWhatsAppText`) deixava emojis como caracteres Unicode crus na URL, confiando no browser para codificá-los. O comportamento é inconsistente entre browsers e pode gerar bytes fora do padrão UTF-8, resultando no glifo de caractere desconhecido no WhatsApp | Substituído por `encodeURIComponent(mensagem)` diretamente. `encodeURIComponent` codifica todos os caracteres não-ASCII (incluindo emojis e acentos) como UTF-8 percent-encoding (`%F0%9F%93%8B` etc.), que é o padrão suportado pelo `wa.me` e decodificado corretamente pelo WhatsApp Web |
| Botão WhatsApp abre nova aba a cada clique | `<a target="_blank">` sempre abre uma nova aba no browser, mesmo que uma aba do WhatsApp Web já esteja aberta, gerando acúmulo de abas | Trocado para `<button onClick>` com `window.open(url, 'whatsapp_panel')`. O segundo argumento é o nome da janela: o browser reutiliza a janela existente (navega para a nova conversa) se ela ainda estiver aberta; só abre uma nova se o usuário a tiver fechado |

## 9. Bugs conhecidos (a corrigir)

Nenhum bug conhecido no momento.

## 10. Pendente para v1.0 (antes do deploy)

- [ ] **Variáveis de ambiente** — extrair `SECRET_KEY`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS` para `.env` com `python-decouple` ou `django-environ`
- [ ] **WhiteNoise** — instalar e configurar para o Django servir o build do React em produção
- [ ] **Build do frontend** — rodar `npm run build` e copiar o `dist/` para dentro do projeto Django (ou configurar o `Dockerfile` para fazer isso no build)
- [ ] **Dockerizar o backend** — criar `Dockerfile` para o Django (imagem base `python:3.x-slim`, instalar dependências, copiar código, rodar `gunicorn`)
- [ ] **docker-compose para desenvolvimento** — `docker-compose.yml` subindo Django + MySQL localmente com um único `docker compose up`, substituindo a necessidade de dois terminais separados
- [ ] **Deploy no GCP Cloud Run** — criar projeto no GCP, configurar Cloud SQL (MySQL) na região `southamerica-east1`, fazer push da imagem para o Artifact Registry e deploy no Cloud Run; configurar `ALLOWED_HOSTS`, `SECRET_KEY` e `DATABASE_URL` via variáveis de ambiente do Cloud Run

## 11. Melhorias planejadas (v1.1)

### Backend
- [ ] **Arquivamento automático de agendamentos antigos** — agendamentos com `data_hora` anterior a 90 dias e status `confirmado` ou `cancelado` movidos para status `arquivado` (novo choice); implementar via `management command` agendado (cron/Railway)
- [ ] **Controle financeiro — `GET /api/v1/financeiro/resumo/`** — retorna para o mês corrente: total de agendamentos confirmados, receita bruta, ticket médio e breakdown por serviço; sem model extra, calculado via agregação no queryset
- [ ] **Gestão de Profissionais** — novo model `Profissional` com FK para `Empresa` (`nome`, `especialidade`, `ativo`); CRUD privado em `api/v1/profissionais/`; `Agendamento` ganha FK opcional `profissional`; `HorarioFuncionamento` poderá ser vinculado a um profissional específico para que cada um tenha sua própria grade de horários (campo `profissional` nullable — `null` significa horário padrão da empresa)

### Frontend
- [ ] **Paleta de cores revisada** — substituir azul intenso (`#2563eb`) por azul bebê (`#60a5fa` / `#bfdbfe`), verde calmo (`#4ade80`) para confirmados e ações positivas; visual mais suave
- [ ] **Página de Financeiro no dashboard** — cards com resumo do mês (receita total, nº de confirmados, ticket médio) + tabela de breakdown por serviço; dados buscados do endpoint de resumo
- [ ] **Seleção de Profissional na página pública** — após selecionar o serviço, exibir cards dos profissionais disponíveis da empresa (buscados em `api/v1/public/{slug}/profissionais/`); cliente escolhe com quem quer ser atendido antes de escolher data e horário; campo profissional enviado no POST de agendamento; passo opcional — se a empresa tiver apenas 1 profissional (ou nenhum cadastrado), o passo é suprimido automaticamente
- [ ] **Página de Profissionais no dashboard** — tabela com nome e especialidade, modal de criação/edição, toggle de ativo/inativo; padrão visual igual às páginas de Serviços e Horários

## 12. Funcionalidades Premium (planos avançados / atualizações futuras)

> Esta seção registra funcionalidades que exigem custo operacional, integrações externas pagas ou infraestrutura adicional — adequadas para um plano pago mais completo ou releases futuras após validação do produto. Sempre que uma ideia de feature "premium" surgir durante o desenvolvimento, ela é documentada aqui antes de ser priorizada.

---

### WhatsApp automático (lembretes e confirmações sem clique humano)

> **Por que é premium?** Exige API externa paga (WhatsApp Business API) + infraestrutura de fila de tarefas. O plano básico cobre o botão manual `wa.me` (v1.1), que não tem custo algum.

**Dependências técnicas necessárias:**

- **API do WhatsApp** — única forma de enviar mensagens programaticamente:
  - **Z-API / Evolution API** — provedores brasileiros, ~R$50–150/mês, integração via `POST` HTTP simples; escolha prática para early-stage
  - **Twilio / Meta Cloud API** — solução oficial Meta, mais robusta, exige aprovação prévia de templates junto à Meta
- **Agendador de tarefas** — para disparar na hora certa sem interação humana:
  - **Celery + Redis** — padrão Django para filas; Redis seria novo serviço na infra GCP
  - **Cloud Scheduler + Cloud Run Job** — alternativa GCP-nativa sem Redis, mas exige segunda imagem Docker

**Fluxo de dados:**
```
Cloud Scheduler (cron a cada hora)
    ↓
Django management command / Cloud Run Job
    ↓  filtra Agendamento onde data_hora ∈ [now+47h, now+49h] e status=confirmado
Z-API / Evolution API
    ↓  POST com whatsapp_cliente + mensagem formatada
Cliente recebe mensagem no WhatsApp
```

- [ ] **Lembrete automático 48h antes** — `management command` `enviar_lembretes` agendado via Cloud Scheduler; mensagem: _"Olá {nome_cliente}! Lembrete: seu agendamento de {servico_nome} é amanhã, {data_hora}. Qualquer dúvida, entre em contato!"_
- [ ] **Confirmação automática imediata** — ao criar agendamento via página pública, disparar mensagem instantânea para `whatsapp_cliente` com resumo completo do agendamento

---

### Controle de acesso por função (RBAC)

> **Por que é premium?** Adiciona complexidade ao modelo de autenticação. No plano básico, cada empresa tem um único dono (`owner`). Com RBAC, seria possível ter múltiplos usuários com papéis distintos por empresa.

- [ ] **Múltiplos usuários por empresa** — model `MembroEmpresa` com roles `dono`, `gerente`, `profissional`; permissões distintas por role (ex: profissional vê apenas seus próprios agendamentos; gerente confirma/cancela mas não altera serviços)

---

### Pagamento online no momento do agendamento

> **Por que é premium?** Exige integração com gateway de pagamento e lógica de confirmação condicional — o agendamento só é efetivado após o pagamento ser aprovado.

- [ ] **Reserva com pagamento antecipado** — cliente paga no momento do agendamento via MercadoPago ou Stripe; agendamento criado com status `aguardando_pagamento` e confirmado automaticamente após webhook de pagamento aprovado; prestador configura por serviço se exige pagamento antecipado ou não

---

### Estratégia de monetização e quando implementar o sistema de planos

O sistema de planos **não deve ser implementado antes das features premium estarem funcionando**. Criar restrições sem ter algo a oferecer no upgrade é complexidade sem retorno.

**Roadmap de monetização:**
```
v1.0 → deploy com todas as features básicas gratuitas (custo = só hospedagem ~R$80–150/mês)
v1.1 → profissionais, financeiro, botão WhatsApp manual (ainda gratuito)
v1.2 → features premium funcionando (WhatsApp automático, pagamento online)
v1.3 → implementar sistema de planos e começar a cobrar
```

**Como implementar tecnicamente (quando chegar a hora):**

1. Adicionar campo `plano` em `Empresa` com choices (`basico`, `profissional`, `premium`)
2. No backend, checar `request.user.empresa.plano` nas views que controlam features premium antes de executar a ação — retornar `HTTP 403` com mensagem de upgrade se o plano não cobrir
3. No frontend, o dashboard lê o plano da empresa (já retornado em `GET /api/v1/empresa/`) e oculta ou bloqueia visualmente as features indisponíveis, exibindo um prompt de upgrade no lugar
4. Integrar MercadoPago ou Stripe: ao assinar, o gateway dispara um webhook que atualiza `empresa.plano` — acesso liberado instantaneamente sem intervenção manual
