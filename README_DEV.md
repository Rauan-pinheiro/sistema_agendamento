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
| `Profissional` | `nome`, `especialidade`, `ativo` | `BaseModel` |
| `Servico` | `nome`, `duracao_min`, `preco` | `BaseModel` |
| `Agendamento` | `servico` (nullable FK, legado), `servicos` (M2M via `AgendamentoServico`), `profissional` (nullable FK), `nome_cliente`, `whatsapp_cliente`, `data_hora`, `status`, `duracao_total_min`, `preco_total` | `BaseModel` |
| `AgendamentoServico` | `agendamento` (FK), `servico` (FK), `ordem` | `Model` |
| `HorarioFuncionamento` | `profissional` (nullable FK), `dia_semana` (0–6), `hora_inicio`, `hora_fim`, `intervalo_min` | `BaseModel` |

### Grades de horário — lógica de prioridade
`HorarioFuncionamento.profissional` é nullable:
- `NULL` → grade geral da empresa (se aplica quando nenhum profissional específico é informado)
- Preenchido → grade individual do profissional (prevalece sobre a grade geral)

Ao resolver horários disponíveis para um profissional:
1. Busca grade do profissional (`empresa + profissional + dia_semana`)
2. Se não encontrar, usa a grade geral da empresa (`empresa + profissional=NULL + dia_semana`)
3. Se nenhuma existir, retorna `{ fechado: true }`

> **Por que o `unique_together` foi removido do banco?** MySQL trata `NULL != NULL` em índice único — ou seja, a constraint `UNIQUE(empresa, profissional, dia_semana)` permitiria múltiplas grades genéricas (todas com `profissional=NULL`) para o mesmo dia, o que é incorreto. A unicidade é garantida no `HorarioFuncionamentoSerializer` com uma query explícita — ver seção 8.

### Status do Agendamento
| Valor | Significado |
|---|---|
| `pendente` | Criado pelo cliente, aguardando confirmação do prestador |
| `confirmado` | Confirmado pelo prestador |
| `cancelado` | Cancelado (por qualquer parte) |
| `arquivado` | Movido automaticamente pelo management command após 90 dias |

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
| GET / POST | `api/v1/profissionais/` | Listar (paginado) e criar profissionais |
| GET / PUT / PATCH / DELETE | `api/v1/profissionais/{id}/` | Gerenciar um profissional |
| GET / POST | `api/v1/servicos/` | Listar (paginado) e criar serviços |
| GET / PUT / PATCH / DELETE | `api/v1/servicos/{id}/` | Gerenciar um serviço |
| GET / POST | `api/v1/agendamentos/` | Listar (paginado, `?status=`, `?profissional_id=`) e criar agendamentos |
| GET / PUT / PATCH / DELETE | `api/v1/agendamentos/{id}/` | Gerenciar um agendamento |
| PATCH | `api/v1/agendamentos/{id}/status/` | Confirmar ou cancelar um agendamento |
| GET / POST | `api/v1/horarios/` | Listar (`?profissional_id=N` ou `?profissional_id=null`) e criar horários |
| GET / PUT / PATCH / DELETE | `api/v1/horarios/{id}/` | Gerenciar um horário de funcionamento |
| GET | `api/v1/financeiro/resumo/` | Resumo financeiro do mês corrente (receita bruta, confirmados, ticket médio) |
| GET / PATCH | `api/v1/usuario/` | Perfil do usuário logado — lê e atualiza username, e-mail e senha |

### Área pública (sem autenticação, via slug)
| Método | Rota | Descrição |
|---|---|---|
| GET | `api/v1/public/{slug}/` | Info da empresa (nome, slug, whatsapp) |
| GET | `api/v1/public/{slug}/profissionais/` | Profissionais ativos da empresa (sem paginação) |
| GET | `api/v1/public/{slug}/servicos/` | Serviços disponíveis da empresa (paginado) |
| POST | `api/v1/public/{slug}/agendamentos/` | Cliente cria um agendamento (`profissional` é opcional no body) |
| GET | `api/v1/public/{slug}/horarios-disponiveis/?data=YYYY-MM-DD[&servicos_ids=1,2,3][&profissional_id=N]` | Retorna slots livres do dia; `servicos_ids` é CSV de IDs — duração do slot = soma das durações; backward compat: `&servico_id=N` (único); inclui `fechado: true` quando nenhuma grade se aplica |

> **Paginação:** as listagens de serviços, agendamentos e profissionais retornam `{ count, next, previous, results: [...] }` com `page_size=20` padrão. O cliente pode passar `?page_size=N` (máx 100) e `?page=N`.
> `GET /api/v1/empresa/` e `GET /api/v1/horarios/` e `GET /api/v1/public/{slug}/profissionais/` são **exceções** com `pagination_class = None` — retornam lista simples (regra: qualquer endpoint com número fixo ou pequeno de registros por tenant deve sobrescrever a paginação).

### Payload do `POST /api/v1/public/{slug}/agendamentos/`
```json
{
  "servicos_ids": [1, 3],   // lista de IDs em ordem de seleção; mínimo 1
  "profissional": 3,        // opcional; null ou omitido = sem profissional específico
  "nome_cliente": "João",
  "whatsapp_cliente": "85999990000",
  "data_hora": "2025-06-10T09:00:00-03:00"
}
```

> O serializer auto-popula `servico` (FK legada) com o primeiro item de `servicos_ids` para manter compatibilidade com dados anteriores à v1.5. Campos calculados `duracao_total_min` e `preco_total` são gravados no banco na criação e não devem ser enviados pelo cliente.

### Resposta do `GET /api/v1/financeiro/resumo/`
```json
{
  "mes_referencia": "2025-05",
  "agendamentos_confirmados": 42,
  "receita_bruta": "3150.00",
  "ticket_medio": "75.00"
}
```

## 6. Fluxos de Usuário

### Prestador (dashboard)
1. Registra conta via `/register` — cria User + Empresa num único POST.
2. Faz login em `/login` — recebe tokens JWT armazenados no localStorage.
3. No dashboard (`/dashboard`):
   - **Agendamentos:** visualiza por aba (Hoje / Todos / Pendentes / Confirmados / Cancelados); a aba "Hoje" é a padrão ao abrir; lista atualiza automaticamente a cada 30s sem recarregar a página; confirma, cancela ou exclui agendamentos (exclusão com confirmação inline); envia mensagem de confirmação pré-formatada via WhatsApp com um clique.
   - **Serviços:** cria, edita e exclui serviços com nome, duração e preço.
   - **Horários:** cadastra os dias da semana e faixas de atendimento (ex: Seg–Sex 08–18h, Sáb 08–13h) com o intervalo de slots desejado; suporta grade geral da empresa e grade individual por profissional.
   - **Financeiro:** cards com receita bruta, total de confirmados e ticket médio do mês corrente, calculados em tempo real pelo backend.

### Cliente (página pública)
1. Acessa `/{slug}` sem login.
2. **Passo 1:** vê os cards de serviços e seleciona **um ou mais** (multi-select com toggle). Cada card selecionado exibe badge "Selecionado". Um painel flutuante abaixo dos cards mostra o total de serviços, duração somada e preço total. O botão "Continuar →" libera os passos seguintes.
3. **Passo 2 (condicional):** se a empresa tiver mais de 1 profissional ativo, exibe cards para escolha do profissional. Se tiver exatamente 1, seleciona automaticamente e pula o passo. Se não tiver nenhum, pula o passo.
4. **Passo 3:** escolhe a data num seletor; a interface busca os slots disponíveis via API (passando a duração total de todos os serviços selecionados) e exibe botões de horário — slots sem espaço suficiente para o conjunto de serviços aparecem riscados e desabilitados.
5. **Passo 4:** preenche nome e WhatsApp e confirma o agendamento; o resumo lista cada serviço escolhido com sua duração, mais o total de tempo e valor.

## 7. O que foi implementado

### Backend
- [x] Models `Empresa`, `BaseModel`, `Servico`, `Agendamento` e `HorarioFuncionamento`
- [x] `Serializers` com validação de integridade (serviço pertence à empresa) e sobreposição de horário
- [x] `ViewSets` com isolamento de Tenant por `get_queryset` e injeção de empresa via `perform_create`
- [x] Roteamento com `DefaultRouter` (rotas privadas) + `path()` manual (rotas públicas com slug)
- [x] Migrations geradas e aplicadas (`0001_initial`, `0002_horariofuncionamento`, `0003_v1_1_profissional_arquivado`)
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
- [x] **[v1.1]** Model `Profissional` herdando `BaseModel` — `nome`, `especialidade`, `ativo`; CRUD privado em `/api/v1/profissionais/`
- [x] **[v1.1]** `Agendamento` ganhou FK opcional `profissional`; detecção de conflito agora é por profissional (quando definido) ou empresa-wide (quando `null`)
- [x] **[v1.1]** `HorarioFuncionamento` ganhou FK opcional `profissional` — `null` = grade geral, preenchido = grade individual; `unique_together` removido do banco e portado para validação no serializer (ver seção 8)
- [x] **[v1.1]** `Agendamento.status` ganhou o choice `arquivado`
- [x] **[v1.1]** `service.py` — camada de lógica desacoplada da view; `calcular_resumo_financeiro(empresa)` agrega `Count`/`Sum` do mês corrente sem model extra
- [x] **[v1.1]** Endpoint `GET /api/v1/financeiro/resumo/` — delega para `service.py`, retorna `mes_referencia`, `agendamentos_confirmados`, `receita_bruta`, `ticket_medio`
- [x] **[v1.1]** `HorariosDisponiveisView` aceita `?profissional_id=N`; resolve a grade com prioridade: grade do profissional → grade geral da empresa; conflitos de slot filtrados pelo profissional correto
- [x] **[v1.1]** Endpoint público `GET /api/v1/public/{slug}/profissionais/` — lista profissionais ativos (sem paginação, sem autenticação)
- [x] **[v1.1]** Management command `arquivar_agendamentos` — flags `--dias N` (padrão 90) e `--dry-run`; isolamento por tenant garantido pela FK `empresa` em cada `Agendamento` (query nunca filtra por empresa explicitamente — cada registro já pertence a um tenant)
- [x] **[v1.3]** `Servico.descricao` (TextField, blank=True) — migration `0004_servico_descricao`; campo opcional exibido na página pública abaixo do nome do serviço
- [x] **[v1.3]** `GET /api/v1/agendamentos/volume/` — action no `AgendamentoViewSet`; `calcular_volume_agendamentos(empresa)` em `service.py` retorna volume por dia da semana (Seg–Dom) e por hora; agregação em Python com `Counter` para consistência SQLite↔MySQL
- [x] **[v1.3]** Validação completa em todos os serializers — `_validar_telefone_br()` (DDD brasileiro + 10–11 dígitos), `nome_cliente` min 2 chars, `duracao_min` 5–480 min, `preco` ≥ 0, `intervalo_min` 5–240 min, `username` mín 3 chars alfanumérico, e-mail único, `data_hora` futura na criação; `.strip()` em todos os campos de texto
- [x] **[v1.4]** `PerfilUsuarioSerializer` + `PerfilUsuarioView` — `GET/PATCH /api/v1/usuario/`; valida username único (mín 3 chars, alfanumérico), e-mail único, troca de senha com verificação da senha atual via `check_password()`
- [x] **[v1.5]** `AgendamentoServico` (through model) com campo `ordem` — tabela intermediária M2M `Agendamento↔Servico` que preserva a ordem de seleção do cliente
- [x] **[v1.5]** `Agendamento.servicos` (ManyToManyField through `AgendamentoServico`) — suporte a múltiplos serviços por agendamento
- [x] **[v1.5]** `Agendamento.duracao_total_min` e `Agendamento.preco_total` — campos desnormalizados gravados na criação; evitam N+1 na detecção de conflitos e garantem precisão no financeiro mesmo que o preço do serviço mude depois
- [x] **[v1.5]** Migration `0005_agendamento_multi_servico` — torna `servico` FK nullable, cria `AgendamentoServico`, adiciona `servicos` M2M, `duracao_total_min` e `preco_total`; backfill automático dos registros existentes
- [x] **[v1.5]** `AgendamentoSerializer` aceita `servicos_ids: [id, ...]` na escrita; preserva ordem, valida pertença à empresa, auto-popula `servico` FK (primeiro da lista) e calcula totais; `_validar_conflito_horario` usa `duracao_total_min` dos agendamentos existentes para detectar sobreposição corretamente com multi-serviço
- [x] **[v1.5]** `servicos_info` (read-only) no `AgendamentoSerializer` — lista `[{id, nome, duracao_min, preco}]` de todos os serviços vinculados; fallback para `servico` FK em dados legados
- [x] **[v1.5]** `HorariosDisponiveisView` aceita `?servicos_ids=1,2,3` (CSV) — calcula `duracao_total` como soma e usa como janela de slot; backward compat com `?servico_id=N`; detecção de conflito de slots usa `ag.duracao_total_min`
- [x] **[v1.5]** `service.py` — `calcular_resumo_financeiro` usa `Sum('preco_total')` em vez de `Sum('servico__preco')`, garantindo valor correto para agendamentos multi-serviço

### Frontend
- [x] Setup React + TypeScript + Vite com Axios e interceptor automático de JWT (refresh em fila)
- [x] `AuthContext` com estado de autenticação, login, registro e logout persistidos em localStorage
- [x] Roteamento com `react-router-dom`: rotas públicas, privadas (`PrivateRoute`) e dashboard aninhado
- [x] Página de Login e Registro (com geração automática de slug a partir do nome)
- [x] Dashboard layout com sidebar responsiva (empresa, slug público, navegação, logout)
- [x] Página de Agendamentos com abas por status e ações de confirmar/cancelar
- [x] Página de Serviços com tabela, modal de criação/edição e exclusão com confirmação
- [x] Página de Horários — cadastro dos dias e faixas de atendimento com modal de criação/edição
- [x] Página pública do cliente com fluxo em passos: selecionar serviço → (profissional) → escolher data e slot → preencher dados
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
- [x] **[v1.1]** Paleta de cores revisada — `--primary: #60a5fa` (azul bebê), `--success: #4ade80` (verde calmo); todos os `rgba()` hardcoded derivados atualizados em `index.css`
- [x] **[v1.1]** Tipos `Profissional`, `ProfissionalPublico` e `FinanceiroResumo` adicionados a `types/index.ts`; `Agendamento` e `HorarioFuncionamento` atualizados com campos `profissional` nullable
- [x] **[v1.1]** `api/profissionais.ts` — CRUD privado de profissionais + `getFinanceiroResumo()`
- [x] **[v1.1]** `api/public.ts` — `listProfissionaisPublicos()` e `profissional_id` em `getHorariosDisponiveis()`
- [x] **[v1.1]** `PublicPage.tsx` — passo de seleção de profissional condicional: suprimido se `profissionais.length <= 1`; auto-seleciona o único profissional; numeração dos passos ajustada dinamicamente; profissional aparece no resumo do booking
- [x] **[v1.1]** `FinanceiroPage.tsx` — 3 cards com receita bruta, confirmados e ticket médio; formata valores com `Intl.NumberFormat` em BRL; rota `/dashboard/financeiro`
- [x] **[v1.1]** `DashboardLayout.tsx` — nav link "Financeiro" com ícone `TrendingUp` (lucide-react)
- [x] **[v1.2]** `ThemeContext.tsx` — provider de tema dark/light com persistência em `localStorage`; aplica `data-theme="dark"` no `<html>` para ativar as variáveis CSS do tema escuro; `useTheme()` expõe `theme` e `toggleTheme()`
- [x] **[v1.2]** `index.css` reescrito — CSS custom properties separadas em paleta de tema (`:root` / `[data-theme="dark"]`) e paleta de marca (compartilhada); variáveis: `--bg`, `--surface`, `--surface-hover`, `--border`, `--text`, `--text-muted`, `--primary`, `--primary-soft`, `--accent`, `--accent-soft`, `--success`, `--danger`, `--warning`; radius `12px`/`8px`; sombras e transições centralizadas em `--shadow-sm/md/lg` e `--t`
- [x] **[v1.2]** Tipografia: `Inter` (Google Fonts) via `<link>` no `index.html`; `lang="pt-BR"` aplicado
- [x] **[v1.2]** Design System — `components/Button.tsx` (variantes: primary/success/accent/ghost/danger/secondary/whatsapp; tamanhos: sm/md/lg; prop `loading` com spinner inline); `components/Badge.tsx` (todos os 4 status + `novo`); `components/Modal.tsx` (backdrop blur, animação slideUp, botão de fechar, slot de footer)
- [x] **[v1.2]** Dashboard — 4 KPI cards no topo (receita bruta, confirmados, ticket médio, hoje); consumem `GET /api/v1/financeiro/resumo/` em paralelo com a lista de agendamentos; skeleton loader nos cards enquanto carrega
- [x] **[v1.2]** Sidebar premium — logo com gradiente linear (azul→roxo), indicador lateral no item ativo, toggle sol/lua no rodapé da sidebar, seção `sidebar-bottom` separada com borda sutil
- [x] **[v1.2]** Bottom navigation mobile — `<nav class="mobile-nav">` fixo na parte inferior; sidebar ocultada em viewport ≤768px; `padding-bottom` no conteúdo para não cobrir cards
- [x] **[v1.2]** Skeleton loaders em todas as listagens (cards de agendamento, linhas de tabela, KPIs, cards de financeiro) — nunca mais spinner de página inteira
- [x] **[v1.2]** Empty states com ícone lucide em todas as listas vazias (Agendamentos, Serviços, Horários, Financeiro)
- [x] **[v1.2]** Progress bar dinâmica na página pública — etapas: Serviço → (Profissional) → Data e hora → Seus dados; estado `done/current/pending` calculado a partir do estado de seleção; ícone `<Check>` substitui número nas etapas concluídas
- [x] **[v1.2]** Cards de serviço redesenhados — preço destacado à direita, `hover: translateX(3px)`, borda colorida ao selecionar
- [x] **[v1.2]** Avatar de profissional com iniciais geradas dinamicamente (substitui emoji 👤)
- [x] **[v1.2]** Cards de agendamento com ícones lucide (Calendar, Phone, DollarSign) nas informações
- [x] **[v1.2]** FinanceiroPage com ícones nos cards (DollarSign, CheckCircle, TrendingUp) e skeleton loader
- [x] **[v1.2]** Auth pages (Login e Registro) com logo gradiente, layout premium e placeholders descritivos
- [x] **[v1.2]** Micro-animações: `fadeIn` na troca de página (`.page`), `slideUp` em modais e cards públicos, `translateY(-2px)` em hover de cards, `shimmer` nos skeleton loaders
- [x] **[v1.2]** `tsc --noEmit` — zero erros TypeScript após o redesign
- [x] **[v1.3]** `ProfissionaisPage.tsx` — tabela com avatar de iniciais, nome, especialidade e badge de status clicável (toggle ativo/inativo direto da tabela); modal de criação/edição com `Button` e `Modal` do design system; rota `/dashboard/profissionais`; item "Profissionais" com ícone `Users` adicionado ao `NAV_ITEMS` (sidebar + bottom nav mobile)
- [x] **[v1.3]** `HorariosPage` — barra de seleção de grade (`grade-selector`): botão "Empresa (geral)" e um por profissional ativo; ao trocar a grade a lista filtra os horários corretos e o modal cria com o `profissional` adequado; `api/horarios.ts` atualizado para aceitar `profissionalId`; `listAllProfissionais()` adicionado a `api/profissionais.ts`
- [x] **[v1.3]** `VolumeChart` em `AgendamentosPage` — bar chart `recharts` mostrando volume total por dia da semana (Seg–Dom); cores e grid adaptativos ao tema via `useTheme()`; skeleton enquanto carrega; consumido de `GET /api/v1/agendamentos/volume/`
- [x] **[v1.3]** `CalendarPicker` na `PublicPage` — substituiu `<input type="date">`; grade mensal 7×N com navegação mês anterior/próximo via `‹`/`›`; dias passados desabilitados; dia selecionado destacado em `--primary`; hoje em negrito; zero dependências externas
- [x] **[v1.3]** Descrição opcional nos cards de serviço — exibida abaixo do nome na página pública (`.service-desc`); textarea opcional no modal de criação/edição em `ServicosPage`
- [x] **[v1.3]** `src/utils/phone.ts` — `formatPhone` (máscara `(XX) XXXXX-XXXX`), `normalizePhone` (extrai dígitos), `isValidPhone` (valida comprimento); aplicados em `RegisterPage` e `PublicPage`; normalização para dígitos puros antes de cada POST à API
- [x] **[v1.3]** `ServicosPage` — função `validateForm` local com mensagens claras para nome < 2 chars, duração fora de 5–480 min e preço negativo; campo `descricao` com textarea; descrição exibida abaixo do nome na tabela
- [x] **[v1.4]** `ConfiguracaoPage.tsx` — 3 seções independentes com save/feedback próprios: **Dados da Empresa** (nome_fantasia, slug + preview do link, whatsapp com máscara + aviso de quebra de bookmarks ao alterar o slug), **Dados da Conta** (username, e-mail) e **Alterar Senha** (senha atual + nova + confirmação); rota `/dashboard/configuracoes`; item "Configurações" com ícone `Settings` no `NAV_ITEMS` (sidebar + bottom nav)
- [x] **[v1.4]** Cabeçalho de perfil — banner gradiente com avatar circular de iniciais, username, e-mail e empresa + slug; atualiza em tempo real após salvar qualquer seção
- [x] **[v1.4]** `AuthContext.atualizarEmpresa()` — sincroniza estado global (sidebar, localStorage) após edição da empresa sem relogar
- [x] **[v1.4]** Branding **DevFlow** na sidebar — texto gradiente azul→roxo acima do nome da empresa; logo com animação `float` (translação 5px, 4s, infinito)
- [x] **[v1.4]** Novas animações CSS — `@keyframes float`, `fadeInUp`, `scaleIn`, `pulse-soft`, `gradient-shift`; classes `.stagger > *:nth-child(N)` para entradas em cascata; `will-change: transform` em `.kpi-card` e `.card`; `translateX(2px)` no hover dos `.nav-link`
- [x] **[v1.4]** `api/usuario.ts` + tipo `PerfilUsuario` em `types/index.ts`
- [x] **[v1.5]** `PublicPage.tsx` — Passo 1 reescrito como multi-select: cada card tem toggle (clique adiciona/remove); badge "Selecionado" com ícone Check aparece no card ativo; painel `.service-selection-summary` exibe contagem, duração total e preço total; botão "Continuar →" confirma a seleção e libera os passos seguintes; ao mudar a seleção a confirmação é desfeita e os passos seguintes são resetados
- [x] **[v1.5]** `AgendamentosPage.tsx` — cards do dashboard exibem todos os serviços separados por " + " via `servicos_info`; valor exibido e usado na mensagem WhatsApp é `preco_total`
- [x] **[v1.5]** `api/public.ts` — `createAgendamentoPublico` envia `servicos_ids[]`; `getHorariosDisponiveis` envia `servicos_ids` como CSV no param `servicos_ids`
- [x] **[v1.5]** `types/index.ts` — novo `ServicoInfo`; `Agendamento` atualizado com `servicos_info`, `duracao_total_min`, `preco_total`; `servico`/`servico_nome`/`servico_preco` tornados nullable
- [x] **[v1.5]** `index.css` — `.service-check-badge` (badge "Selecionado" no card) e `.service-selection-summary` / `.service-selection-info` / `.service-selection-count` / `.service-selection-details` (painel de resumo da seleção)

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
| **[v1.1]** `unique_together` em `HorarioFuncionamento` quebra com `profissional=NULL` no MySQL | Com `profissional` nullable, a constraint `UNIQUE(empresa, profissional, dia_semana)` no banco não protege o caso genérico: MySQL trata `NULL != NULL`, portanto múltiplas linhas `(empresa=1, NULL, 0)` passariam pela constraint sem erro — permitindo duas grades genéricas para segunda-feira na mesma empresa | `unique_together` removido do `Meta`. `HorarioFuncionamentoSerializer.validate()` executa a query explícita `HorarioFuncionamento.objects.filter(empresa=..., profissional=..., dia_semana=...).exists()` (com `filter(profissional__isnull=True)` para o caso genérico) e lança `ValidationError` se já existir. SQLite em desenvolvimento tem o mesmo comportamento com `NULL` em índices, então a correção é consistente entre ambientes |
| **[v1.1]** Conflito de agendamento com múltiplos profissionais | Dois profissionais diferentes podem atender clientes ao mesmo tempo — a lógica original checava conflitos empresa-wide, o que bloquearia agendamentos simultâneos para profissionais distintos | `AgendamentoSerializer._validar_conflito_horario` agora segmenta a busca: se o novo agendamento tem `profissional != None`, filtra candidatos por `profissional=profissional`; se `profissional=None`, filtra por `profissional__isnull=True`. Agendamentos de profissionais distintos nunca colidem |
| **[v1.1]** Passo de profissional na `PublicPage` pode quebrar o `useEffect` de slots | Ao trocar de profissional após já ter selecionado data + slot, o estado `profissionalId` muda mas `dataSelecionada` não é zerada — o `useEffect` de slots não seria re-disparado se a dependência fosse só `dataSelecionada` | `profissionalId` foi adicionado ao array de dependências do `useEffect` de slots. Ao trocar de profissional, `dataSelecionada` e `slotSelecionado` são zerados em `handleSelecionarProfissional`, garantindo que o usuário refaça a escolha de data com a grade correta do novo profissional |
| **[v1.1]** `profissionalId = undefined` vs `null` na `PublicPage` | O componente usa `undefined` para "passo suprimido (sem profissionais)" e `null` para "profissional ainda não escolhido (passo ativo)". Enviar `undefined` no payload de criação do agendamento causaria campos omitidos vs `null` no JSON | No `handleSubmit` e no `useEffect` de slots: `profId = profissionalId === undefined ? null : profissionalId`. O payload enviado ao backend sempre tem `profissional: null` (sem profissional específico) ou `profissional: <id>` (profissional selecionado) — nunca `profissional: undefined` |
| **[v1.1]** `management command` + `auto_now=True` em `atualizado_em` | `QuerySet.update()` não dispara o `.save()` dos registros e portanto não aciona `auto_now=True`. Incluir `atualizado_em=timezone.now()` no `update()` funcionaria no SQLite, mas em Django a semântica canônica é que `auto_now` só roda via `.save()` | O comando usa apenas `qs.update(status='arquivado')` sem tentar setar `atualizado_em`. O campo reflete a última edição manual do registro, não o arquivamento em lote — comportamento aceitável para uma operação de manutenção |
| **[v1.3]** Migration `0004_servico_descricao` não aplicada → página pública retorna 500 | `GET /api/v1/public/{slug}/servicos/` retornava `Internal Server Error: no such column: agendamentos_servico.descricao`. O Django exibe o aviso `You have N unapplied migration(s)` na inicialização, mas o servidor sobe normalmente — o erro só aparece em tempo de requisição. No frontend, o `catch` genérico do `Promise.all` capturava o 500 e exibia "Empresa não encontrada", ocultando a causa real | Executar `python manage.py migrate` sempre que o Django avisar sobre migrations pendentes. O aviso na inicialização (`You have N unapplied migration(s)`) é bloqueante para qualquer endpoint que acesse o model alterado — nunca ignorá-lo |
| **[v1.5]** `preco_total` / `duracao_total_min` desnormalizados vs propriedades computadas | Usar `@property` no model para calcular os totais causaria N+1 queries na detecção de conflitos (um SELECT de `servicos` por agendamento existente no loop) e impossibilitaria `Sum('preco_total')` no ORM para o financeiro | Campos armazenados no banco, calculados e gravados em `AgendamentoSerializer.create()` e `update()`. Backfill automático na migration `0005` copia `servico.duracao_min` e `servico.preco` para todos os registros anteriores. Limitação conhecida: o `preco_total` reflete o preço **no momento do agendamento**, não muda se o serviço for editado depois — comportamento aceitável e até desejado (preço bloqueado na reserva) |
| **[v1.5]** `unique_together` em `AgendamentoServico` com `(agendamento, servico)` | Um cliente não deve poder selecionar o mesmo serviço duas vezes no mesmo agendamento | `unique_together = [('agendamento', 'servico')]` em `AgendamentoServico.Meta`. No frontend, `toggleServico` usa `Set`-like: adiciona se ausente, remove se presente — impossível duplicar pelo client. A constraint no banco é a linha de defesa final |
| **[v1.5]** `servicos_ids` write field vs `servicos` M2M no serializer | `servicos` é o nome do campo M2M no model. Se o serializer declarasse um campo `servicos = PrimaryKeyRelatedField(many=True)`, o DRF tentaria gerir o M2M automaticamente via `field.set()`, o que não funciona com through model customizado (`AgendamentoServico` com `ordem`) | Campo de escrita nomeado `servicos_ids` (ListField de ints) — nome diferente do campo M2M evita conflito com o DRF. Em `validate()`, os IDs são resolvidos e armazenados em `_servicos_list` (chave temporária no `validated_data`). Em `create()`, esse valor é popped antes de chamar `super().create()` e os `AgendamentoServico` são criados manualmente com o campo `ordem` |

## 9. Bugs conhecidos (a corrigir)

Nenhum bug conhecido no momento.

## 14. Melhorias implementadas (v1.4) ✅

### Backend
- [x] **`GET/PATCH /api/v1/usuario/`** — endpoint de perfil do usuário logado; `PerfilUsuarioSerializer` valida username (único, mín 3 chars, alfanumérico), e-mail único, e troca de senha com verificação da senha atual; `PerfilUsuarioView` retorna `{ username, email }` no GET e atualiza o usuário no PATCH

### Frontend
- [x] **Página de Configurações no dashboard** — `ConfiguracaoPage.tsx`; 3 seções independentes: **Dados da Empresa** (nome_fantasia, slug com preview do link, whatsapp com máscara), **Dados da Conta** (username, e-mail) e **Alterar Senha** (senha atual + nova + confirmação); cada seção tem botão de salvar próprio e feedback inline de sucesso/erro animado; aviso laranja ao alterar o slug (quebra bookmarks dos clientes); rota `/dashboard/configuracoes`; item "Configurações" com ícone `Settings` adicionado ao `NAV_ITEMS` (sidebar + bottom nav mobile)
- [x] **Perfil do usuário no cabeçalho** — banner gradiente com avatar circular de iniciais, username, e-mail e nome da empresa + slug; atualiza em tempo real após salvar
- [x] **`atualizarEmpresa()`** no `AuthContext` — permite que a `ConfiguracaoPage` sincronize o estado global (sidebar, localStorage) após salvar novos dados da empresa sem precisar relogar
- [x] **Branding DevFlow na sidebar** — nome "DevFlow" em texto gradiente (azul→roxo) acima do nome da empresa; logo com animação `float` suave (translação vertical 5px em 4s)
- [x] **Novas animações CSS** — `@keyframes float` (logo da sidebar), `fadeInUp` (seções da config page com stagger 60ms), `scaleIn` (feedback inline), `pulse-soft`, `gradient-shift`; classes utilitárias `.stagger > *:nth-child(N)` para atrasar entradas de listas; `will-change` adicionado em `.kpi-card` e `.card` para otimizar GPU; `translateX(2px)` no hover dos `.nav-link`
- [x] **`api/usuario.ts`** — `getPerfilUsuario()` e `updatePerfilUsuario(payload)` consumindo `/api/v1/usuario/`
- [x] **Tipo `PerfilUsuario`** adicionado a `types/index.ts`

## 10. Pendente para v1.0 (antes do deploy)

- [ ] **Variáveis de ambiente** — extrair `SECRET_KEY`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS` para `.env` com `python-decouple` ou `django-environ`
- [ ] **WhiteNoise** — instalar e configurar para o Django servir o build do React em produção
- [ ] **Build do frontend** — rodar `npm run build` e copiar o `dist/` para dentro do projeto Django (ou configurar o `Dockerfile` para fazer isso no build)
- [ ] **Dockerizar o backend** — criar `Dockerfile` para o Django (imagem base `python:3.x-slim`, instalar dependências, copiar código, rodar `gunicorn`)
- [ ] **docker-compose para desenvolvimento** — `docker-compose.yml` subindo Django + MySQL localmente com um único `docker compose up`, substituindo a necessidade de dois terminais separados
- [ ] **Deploy no GCP Cloud Run** — criar projeto no GCP, configurar Cloud SQL (MySQL) na região `southamerica-east1`, fazer push da imagem para o Artifact Registry e deploy no Cloud Run; configurar `ALLOWED_HOSTS`, `SECRET_KEY` e `DATABASE_URL` via variáveis de ambiente do Cloud Run

## 11. Melhorias implementadas (v1.1) ✅

### Backend
- [x] **Arquivamento automático de agendamentos antigos** — management command `arquivar_agendamentos`; flags `--dias N` (padrão 90) e `--dry-run`; move agendamentos `confirmado`/`cancelado` com `data_hora` anterior ao limite para status `arquivado`; isolamento por tenant garantido pela FK `empresa` em cada registro
- [x] **Controle financeiro — `GET /api/v1/financeiro/resumo/`** — retorna para o mês corrente: `agendamentos_confirmados`, `receita_bruta`, `ticket_medio`; lógica de agregação encapsulada em `service.py` (`calcular_resumo_financeiro`); sem model extra
- [x] **Gestão de Profissionais** — model `Profissional` (`nome`, `especialidade`, `ativo`) herdando `BaseModel`; CRUD privado em `/api/v1/profissionais/`; `Agendamento` e `HorarioFuncionamento` ganharam FK nullable `profissional`; grade individual por profissional com fallback para grade geral da empresa

### Frontend
- [x] **Paleta de cores revisada** — `--primary: #60a5fa` / `#bfdbfe`, `--success: #4ade80`; visual mais suave
- [x] **Página de Financeiro no dashboard** — 3 cards (receita bruta, confirmados, ticket médio); valores formatados em BRL via `Intl.NumberFormat`; rota `/dashboard/financeiro`
- [x] **Seleção de Profissional na página pública** — passo condicional: suprimido se `profissionais.length <= 1` (auto-seleciona único ou envia `null`); exibido como Passo 2 se `> 1`; numeração dinâmica dos passos seguintes; profissional listado no resumo do agendamento

## 12. Melhorias implementadas (v1.2) ✅

### Identidade e tema

- [x] **Tema escuro como padrão** — `ThemeContext` usa `'dark'` quando não há valor no `localStorage`; primeiro acesso ao sistema já inicia no modo escuro
- [x] **Título do app** — `<title>` alterado para `DevFlow - Agenda` em `index.html`
- [x] **Sistema de temas dark/light** — `ThemeContext` com persistência em `localStorage`; `data-theme` no `<html>`; toggle sol/lua visível na sidebar e no bottom nav mobile

### Design System e UI base

- [x] **Design System** — componentes `Button`, `Badge` e `Modal` centralizados em `src/components/`; reutilizados em todas as páginas do dashboard
- [x] **CSS Variables completo** — `index.css` reescrito com paleta light/dark separada e paleta de marca compartilhada; sem cor hardcoded fora das variáveis
- [x] **Tipografia Inter** — fonte carregada via Google Fonts; `lang="pt-BR"` no `index.html`
- [x] **Sidebar premium** — logo com gradiente, indicador lateral no item ativo, seção de utilitários separada no rodapé
- [x] **Bottom navigation mobile** — sidebar oculta em ≤768px; nav fixo na parte inferior com os mesmos itens
- [x] **Skeleton loaders** — em KPIs, cards de agendamento, linhas de tabela e cards de financeiro; sem spinner de página inteira
- [x] **Empty states com ícone** — em todas as listas do dashboard (Agendamentos, Serviços, Horários, Financeiro)
- [x] **Micro-animações** — `fadeIn` em páginas, `slideUp` em modais, `shimmer` em skeletons, `translateY(-2px)` em hover de cards
- [x] **Auth pages premium** — logo gradiente, layout com hierarquia visual clara, placeholders descritivos

### Dashboard de Agendamentos

- [x] **KPI cards no topo** — 4 cards (Receita bruta, Confirmados, Ticket médio, Hoje) consumindo `GET /api/v1/financeiro/resumo/` em paralelo com a lista de agendamentos; skeleton enquanto carrega
- [x] **Cards de agendamento redesenhados** — ícones lucide (Calendar, Phone, DollarSign) em lugar de emojis; Badge de status com ponto colorido; layout refinado
- [x] **Mensagem de lembrete WhatsApp** — formato premium e personalizado; inclui nome da empresa (via `AuthContext`), nome do profissional (quando houver), data por extenso com dia da semana, valor formatado em BRL; assinatura `— {nome da empresa}` ao final; usa `encodeURIComponent` para garantir emojis e acentos corretos no `wa.me`

### Financeiro — overhaul completo

#### Backend
- [x] **`service.py` estendido** — `calcular_resumo_financeiro(empresa, mes_ref?)` aceita mês arbitrário; retorna 10 campos: `total_agendamentos`, `confirmados`, `cancelados`, `pendentes`, `receita_bruta`, `ticket_medio`, `taxa_confirmacao`, `por_dia[]`, `por_servico[]`; isolamento tenant mantido
- [x] **`FinanceiroResumoView` com seletor de mês** — aceita `?mes=YYYY-MM`; valida o formato antes de processar; padrão continua sendo o mês corrente
- [x] **Tipo `FinanceiroResumo` atualizado** — 10 campos em `types/index.ts`; `api/profissionais.ts` passa `params: { mes }` quando fornecido

#### Frontend
- [x] **Seletor de período** — dropdown com os últimos 13 meses no cabeçalho da página; ao trocar o mês todos os dados e gráficos atualizam
- [x] **6 KPI cards** — Receita bruta, Confirmados, Ticket médio, Total, Cancelados, Pendentes; cada um com ícone lucide, cor semântica e borda lateral colorida
- [x] **Barra de progresso** da taxa de confirmação — visual inline com porcentagem, texto descritivo e barra animada em CSS
- [x] **Bar chart** (`recharts BarChart`) — receita por dia do mês; eixos e grid adaptativos ao tema via `useTheme()`; tooltip customizado (fundo `var(--surface)`, borda `var(--border)`)
- [x] **Donut chart** (`recharts PieChart`) — distribuição da receita por serviço; rosca com `innerRadius`; legenda customizada com cor, nome e percentual; 8 cores distintas
- [x] **`recharts` instalado** como dependência do projeto frontend

### Página pública
- [x] **Progress bar dinâmica** — etapas: Serviço → Profissional (condicional) → Data e hora → Seus dados; estado `done/current/pending` atualiza conforme o usuário avança
- [x] **Cards de serviço e profissional redesenhados** — preço destacado à direita, avatar com iniciais do profissional (substitui emoji 👤), hover com deslocamento lateral (`translateX(3px)`)

## 13. Melhorias implementadas (v1.3) ✅

### Frontend
- [x] **Página de Profissionais no dashboard** — `ProfissionaisPage.tsx`; tabela com avatar de iniciais, nome, especialidade e badge de status clicável (toggle ativo/inativo); modal de criação/edição com `Button` e `Modal` do design system; rota `/dashboard/profissionais`; item "Profissionais" adicionado ao `NAV_ITEMS` do `DashboardLayout` (sidebar + mobile nav)
- [x] **Horários por profissional no dashboard** — `HorariosPage` ganhou barra de seleção de grade (`grade-selector`): botões "Empresa (geral)" e um por profissional; ao trocar a grade, lista e modal filtram/criam horários para o profissional correto (ou `null` = grade geral); `api/horarios.ts` atualizado para aceitar `profissionalId`; `listAllProfissionais()` adicionado a `api/profissionais.ts`
- [x] **Gráfico de volume de agendamentos** — `VolumeChart` em `AgendamentosPage` (bar chart `recharts`); exibe total por dia da semana (Seg–Dom); cores e grid adaptativos ao tema via `useTheme()`; skeleton enquanto carrega; dados via `GET /api/v1/agendamentos/volume/`
- [x] **Calendário visual na página pública** — componente `CalendarPicker` substituiu `<input type="date">`; grade mensal 7×N com navegação mês anterior/próximo; dias passados desabilitados (opacidade reduzida); dia selecionado destacado em `--primary`; hoje em negrito; sem dependências externas
- [x] **Descrição opcional nos serviços** — campo `descricao` (TextField, blank=True) em `Servico`; migration `0004_servico_descricao`; exibido abaixo do nome na página pública (`.service-desc`) e como textarea opcional no modal de criação/edição; validação frontend inclui trim antes de salvar
- [x] **Validação completa de dados** — frontend: máscara `(XX) XXXXX-XXXX` em todos os campos WhatsApp (`RegisterPage`, `PublicPage`); utilitário `src/utils/phone.ts` (`formatPhone`, `normalizePhone`, `isValidPhone`); normalização para dígitos antes de enviar à API; validação local antes do POST (nome, telefone, senha, slug, ranges numéricos); backend: `_validar_telefone_br()` valida DDD + comprimento 10–11 dígitos + DDDs brasileiros válidos em todos os serializers que recebem telefone; `nome_cliente` min 2 chars; `duracao_min` 5–480 min; `preco` ≥ 0; `intervalo_min` 5–240 min; `username` min 3 chars, alfanumérico; e-mail único no registro; `data_hora` deve ser futura (criação de agendamento); todos os campos de texto têm `.strip()` no backend

### Backend
- [x] Migration `0004_servico_descricao` — `descricao` (TextField, blank=True) em `Servico`
- [x] `GET /api/v1/agendamentos/volume/` — action no `AgendamentoViewSet`; delega para `calcular_volume_agendamentos(empresa)` em `service.py`; retorna `por_dia_semana[]` e `por_hora[]`; agregação em Python com `Counter` para consistência entre SQLite e MySQL
- [x] Validators completos em todos os serializers — ver campo "Validação completa de dados" acima

### Pendente (v1.5 — antes do deploy)

Todos os itens v1.5 foram implementados. ✅

## 17. Melhorias implementadas (v1.5) ✅

### Backend
- [x] **`AgendamentoServico` (through model)** — tabela intermediária M2M com campo `ordem`; `unique_together (agendamento, servico)` impede duplicatas; ordering por `ordem` preserva a sequência de seleção do cliente
- [x] **`Agendamento.servicos` (ManyToManyField)** — vincula múltiplos serviços a um único agendamento via `AgendamentoServico`; `servico` FK original mantida (nullable) para backward compat com dados anteriores à v1.5
- [x] **`Agendamento.duracao_total_min` e `preco_total`** — campos desnormalizados gravados na criação; eliminam N+1 na detecção de conflitos; `service.py` usa `Sum('preco_total')` para receita financeira correta em agendamentos multi-serviço
- [x] **Migration `0005_agendamento_multi_servico`** — altera `servico` para nullable, cria `AgendamentoServico`, adiciona `servicos` M2M e os dois campos calculados; inclui `RunPython` de backfill que popula `duracao_total_min` e `preco_total` em todos os registros existentes
- [x] **`AgendamentoSerializer` multi-serviço** — campo de escrita `servicos_ids` (ListField) aceita lista ordenada de IDs; valida que todos pertencem à empresa; auto-popula `servico` FK com o primeiro ID (backward compat); `create()` e `update()` criam/substituem `AgendamentoServico` e calculam os totais; `_validar_conflito_horario` usa `ag.duracao_total_min` dos agendamentos existentes
- [x] **`servicos_info` (read-only)** no `AgendamentoSerializer` — retorna `[{id, nome, duracao_min, preco}]` de todos os serviços vinculados; fallback para `servico` FK em dados legados
- [x] **`HorariosDisponiveisView` multi-serviço** — aceita `?servicos_ids=1,2,3` (CSV de IDs); soma as durações para calcular a janela mínima de cada slot; backward compat com `?servico_id=N`; detecção de slots ocupados usa `ag.duracao_total_min`

### Frontend
- [x] **`PublicPage.tsx` — Passo 1 multi-select** — cards de serviço funcionam como toggle (clique adiciona ou remove da seleção); badge azul "Selecionado" aparece no card ativo; painel `.service-selection-summary` mostra contagem, duração somada e preço total; botão "Continuar →" confirma e libera passos seguintes; ao mudar a seleção o passo é revertido e slots/data são limpos
- [x] **Resumo do agendamento multi-serviço** — Step 4 (dados pessoais) lista cada serviço selecionado com duração individual; exibe duração total e preço total destacados
- [x] **`AgendamentosPage.tsx`** — cards do dashboard mostram todos os serviços separados por " + " via `servicos_info`; valor exibido e mensagem WhatsApp usam `preco_total`
- [x] **`api/public.ts`** — `createAgendamentoPublico` envia `servicos_ids[]`; `getHorariosDisponiveis` passa `servicos_ids` como CSV no query param
- [x] **`types/index.ts`** — novo `ServicoInfo`; `Agendamento` atualizado com `servicos_info`, `duracao_total_min`, `preco_total`; campos legados `servico`/`servico_nome`/`servico_preco` tornados nullable
- [x] **`index.css`** — `.service-check-badge` (badge no card selecionado) e bloco `.service-selection-summary` com variáveis CSS do tema

---

## 16. Melhorias planejadas (v1.6) 🔜

### Dashboard — cards de agendamento mais informativos
- [ ] **Exibir profissional no card de agendamento** — o campo `profissional_nome` já vem no serializer (`AgendamentoSerializer`), mas não é renderizado visualmente nos cards da `AgendamentosPage`; adicionar linha com ícone `User` e nome do profissional abaixo do nome do cliente, com fallback "Sem profissional definido" quando `profissional_nome` for `null`; manter consistência visual com os ícones de `Calendar`, `Phone` e `DollarSign` já existentes
- [ ] **Resumo completo do agendamento no card** — revisar layout dos cards para garantir que todas as informações relevantes (serviço, profissional, data/hora, status, valor) sejam visíveis de forma hierárquica e intuitiva sem precisar abrir nenhuma tela adicional
- [ ] **Badge de status com ação rápida integrada** — clicar no badge `Pendente` diretamente confirma o agendamento (com micro-confirmação inline), sem precisar rolar até os botões de ação

### Auto-refresh aprimorado
- [ ] **Polling inteligente** — o intervalo fixo de 30s atual não distingue inatividade real de aba ativa; implementar backoff exponencial: inicia em 15s e dobra a cada 3 ciclos sem novos dados até máximo de 60s; reset para 15s ao detectar novo agendamento ou ação do usuário
- [ ] **Indicador de "novo agendamento"** — ao detectar agendamentos novos no polling (comparando `criado_em` com o timestamp do último fetch), exibir toast/badge de notificação discreta no topo da lista antes de atualizar silenciosamente
- [ ] **Atualização em tempo real via WebSocket (premium)** — substituir polling por Django Channels + WebSocket para push de novos agendamentos instantâneo; classificado como feature premium pois requer infraestrutura adicional (ASGI, Redis)

### Responsividade 100%
- [ ] **Auditoria de breakpoints** — mapear todos os componentes que apresentam overflow ou layout quebrado abaixo de 375px (iPhone SE); priorizar: tabela de Serviços, tabela de Profissionais, cards de Agendamentos, sidebar em telas intermediárias (768px–1024px)
- [ ] **Tabelas → cards em mobile** — converter as tabelas de `ServicosPage` e `ProfissionaisPage` para layout de cards empilhados em viewport ≤ 640px (mesma abordagem já usada em Agendamentos); manter tabela apenas em desktop
- [ ] **Modal responsivo** — o componente `Modal` tem largura fixa; adaptar para `width: min(480px, 95vw)` e garantir que o conteúdo interno não extrapole em celulares pequenos
- [ ] **Bottom nav completo** — adicionar itens de Financeiro e Configurações ao `mobile-nav` (atualmente só mostra Agendamentos, Serviços, Profissionais, Horários e Tema)
- [ ] **Teclado virtual no mobile** — campos de formulário dentro de modais devem fazer scroll para não ficarem ocultos pelo teclado virtual do iOS/Android; usar `scroll-padding-bottom` ou `scrollIntoView` no `onFocus`

## 15. Funcionalidades Premium (planos avançados / atualizações futuras)

> Esta seção registra funcionalidades que exigem custo operacional, integrações externas pagas ou infraestrutura adicional — adequadas para um plano pago mais completo ou releases futuras após validação do produto. Sempre que uma ideia de feature "premium" surgir durante o desenvolvimento, ela é documentada aqui antes de ser priorizada.

---

### WhatsApp automático (lembretes e confirmações sem clique humano)

> **Por que é premium?** Exige API externa paga (WhatsApp Business API) + infraestrutura de fila de tarefas. O plano básico cobre o botão manual `wa.me` (implementado), que não tem custo algum.

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
v1.1 → profissionais, financeiro, paleta revisada ✅ (implementado)
v1.2 → redesign frontend premium, design system, dark/light, KPIs, skeleton, mobile nav ✅ (implementado)
v1.3 → página de profissionais, horários por profissional, gráfico de volume, calendário visual,
        descrição nos serviços, validação completa frontend + backend ✅ (implementado)
v1.4 → página de Configurações (empresa + conta + senha), branding DevFlow, animações CSS, endpoint /api/v1/usuario/ ✅ (implementado)
v1.5 → seleção múltipla de serviços (M2M com ordem, duracao_total_min, preco_total, multi-select na página pública) ✅ (implementado)
v1.6 → cards de agendamento completos (profissional visível), auto-refresh inteligente, responsividade 100%
v1.7 → deploy GCP (Cloud Run + Cloud SQL), WhiteNoise, Dockerfile, variáveis de ambiente
v1.8 → features premium (WhatsApp automático, pagamento online), sistema de planos e cobrança
```

**Como implementar tecnicamente (quando chegar a hora):**

1. Adicionar campo `plano` em `Empresa` com choices (`basico`, `profissional`, `premium`)
2. No backend, checar `request.user.empresa.plano` nas views que controlam features premium antes de executar a ação — retornar `HTTP 403` com mensagem de upgrade se o plano não cobrir
3. No frontend, o dashboard lê o plano da empresa (já retornado em `GET /api/v1/empresa/`) e oculta ou bloqueia visualmente as features indisponíveis, exibindo um prompt de upgrade no lugar
4. Integrar MercadoPago ou Stripe: ao assinar, o gateway dispara um webhook que atualiza `empresa.plano` — acesso liberado instantaneamente sem intervenção manual
