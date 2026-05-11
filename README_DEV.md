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
   - **Agendamentos:** visualiza por aba (Todos / Pendentes / Confirmados / Cancelados), confirma ou cancela.
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

## 9. Bugs conhecidos (a corrigir)

- [ ] **Slots passados exibidos como disponíveis para a data de hoje (backend)** — o endpoint `GET /api/v1/public/{slug}/horarios-disponiveis/?data=YYYY-MM-DD` gera os slots a partir do `HorarioFuncionamento` e descarta apenas os que já têm `Agendamento` confirmado. Ele **não compara os slots com a hora atual** (`timezone.now()`). Ao selecionar a data de hoje, slots anteriores ao momento presente (ex: 08:00 quando já são 14:36) aparecem como disponíveis. **Correção:** na view `HorarioDisponivelView`, ao construir a lista de slots, descartar qualquer `slot_datetime < timezone.now()` antes de retornar a resposta.

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

### Frontend
- [ ] **Paleta de cores revisada** — substituir azul intenso (`#2563eb`) por azul bebê (`#60a5fa` / `#bfdbfe`), verde calmo (`#4ade80`) para confirmados e ações positivas; visual mais suave
- [ ] **Página de Financeiro no dashboard** — cards com resumo do mês (receita total, nº de confirmados, ticket médio) + tabela de breakdown por serviço; dados buscados do endpoint de resumo
- [ ] **Filtro "Hoje" na página de Agendamentos** — adicionar aba ou toggle "Hoje" que filtra os agendamentos cuja `data_hora` cai no dia atual (comparação no frontend, sem chamada extra à API); posicionar como primeira aba ou destaque visual para ser o acesso padrão do prestador no dia a dia
- [ ] **Confirmação de agendamento via WhatsApp** — na lista de agendamentos com status `pendente` ou `confirmado`, exibir botão "Confirmar via WhatsApp" que abre `https://wa.me/{whatsapp_cliente}` com mensagem pré-formatada via query param `?text=`; a mensagem deve incluir: nome do cliente, nome do serviço, data e hora formatados em pt-BR, preço e uma saudação de confirmação. Exemplo de mensagem: _"Olá {nome_cliente}! Seu agendamento de {servico_nome} está confirmado para {data_hora} por R$ {preco}. Até lá! 😊"_
