# Projeto: SaaS de Agendamento Multi-Tenant

## 1. Visão Geral
Sistema SaaS focado em prestadores de serviços (barbearias, clínicas, etc.). Cada assinante possui um ambiente isolado para gestão de horários, serviços e clientes, além de uma página pública acessada via slug para receber agendamentos de clientes finais.

## 2. Arquitetura e Stack
- **Backend:** Python / Django + Django Rest Framework
- **Banco de Dados:** SQLite (desenvolvimento) → MySQL via Railway (produção)
- **Frontend:** React + TypeScript + Vite — consome a API REST via Axios com interceptor JWT
- **Infra:** Deploy planejado na plataforma Railway
- **Estratégia de Produto:** Web-First (mobile e desktop em planos futuros)

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
| GET | `api/v1/public/{slug}/horarios-disponiveis/?data=YYYY-MM-DD[&servico_id=N]` | Retorna slots livres do dia |

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

## 8. Decisões técnicas e armadilhas conhecidas

| Contexto | Decisão / Problema | Solução adotada |
|---|---|---|
| Paginação global + `EmpresaViewSet` | `DEFAULT_PAGINATION_CLASS` no `settings.py` envolve **todos** os ViewSets no envelope `{ count, results }`. Como `getMinhaEmpresa()` fazia `data[0]` esperando uma lista simples, `empresa.slug` virava `undefined` e o link da sidebar gerava `/undefined` | `EmpresaViewSet` recebe `pagination_class = None` explicitamente, pois um usuário sempre tem exatamente 1 empresa. A regra geral: qualquer endpoint que retorna um único objeto ou uma lista de tamanho fixo deve sobrescrever `pagination_class = None` |
| Slots disponíveis sem serviço selecionado | O endpoint `horarios-disponiveis` pode ser chamado sem `?servico_id` | Quando sem `servico_id`, usa `intervalo_min` do horário como duração padrão do slot |
| Fuso horário nos slots | `HorarioFuncionamento` armazena `hora_inicio`/`hora_fim` como `TimeField` (naive). Agendamentos são `DateTimeField` armazenados em UTC | Slots gerados com `timezone.make_aware(..., get_current_timezone())` e a comparação de conflitos é feita entre `aware datetimes`, evitando erros de offset |

## 9. Pendente para v1.0 (antes do deploy)


- [ ] **Deploy no Railway com banco MySQL** — ajustar `DATABASES` via variável de ambiente, instalar `mysqlclient`, configurar `ALLOWED_HOSTS` e `SECRET_KEY` via env vars, servir arquivos estáticos com `whitenoise`
- [ ] **Build do frontend** — rodar `npm run build` e configurar o Django para servir os arquivos estáticos ou subir o frontend num serviço separado (Vercel/Netlify)
- [ ] **Variáveis de ambiente** — extrair `SECRET_KEY`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS` para `.env` com `python-decouple` ou `django-environ`

## 10. Melhorias planejadas (v1.1)

### Backend
- [ ] **Arquivamento automático de agendamentos antigos** — agendamentos com `data_hora` anterior a 90 dias e status `confirmado` ou `cancelado` movidos para status `arquivado` (novo choice); implementar via `management command` agendado (cron/Railway)
- [ ] **Controle financeiro — `GET /api/v1/financeiro/resumo/`** — retorna para o mês corrente: total de agendamentos confirmados, receita bruta, ticket médio e breakdown por serviço; sem model extra, calculado via agregação no queryset

### Frontend
- [ ] **Paleta de cores revisada** — substituir azul intenso (`#2563eb`) por azul bebê (`#60a5fa` / `#bfdbfe`), verde calmo (`#4ade80`) para confirmados e ações positivas; visual mais suave
- [ ] **Página de Financeiro no dashboard** — cards com resumo do mês (receita total, nº de confirmados, ticket médio) + tabela de breakdown por serviço; dados buscados do endpoint de resumo
