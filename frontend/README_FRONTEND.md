# Frontend — SaaS de Agendamento

> **Visão geral do ecossistema** → [`../README_ROOT.md`](../README_ROOT.md)
> **Documentação do Backend** → [`../backend/README_BACKEND.md`](../backend/README_BACKEND.md)

Stack: **React + TypeScript + Vite** — Axios com interceptor JWT, build servido pelo Django via WhiteNoise.

---

## 6. Fluxos de Usuário

### Prestador (dashboard)

1. Registra conta via `/register` — cria User + Empresa num único POST.
2. Faz login em `/login` — recebe tokens JWT armazenados no localStorage.
3. No dashboard (`/dashboard`):
   - **Agendamentos:** visualiza por aba (Hoje / Todos / Pendentes / Confirmados / Cancelados); a aba "Hoje" é a padrão ao abrir; lista atualiza automaticamente a cada 30s sem recarregar a página; confirma, cancela ou exclui agendamentos (exclusão com confirmação inline); envia mensagem de confirmação pré-formatada via WhatsApp com um clique; ao clicar no card ele expande inline revelando lista de serviços com duração individual, profissional com avatar de iniciais, botão WhatsApp e ações.
   - **Serviços:** cria, edita e exclui serviços com nome, descrição opcional, duração e preço.
   - **Profissionais:** tabela com avatar de iniciais, nome, especialidade e badge de status clicável (toggle ativo/inativo direto da tabela).
   - **Horários:** cadastra os dias da semana e faixas de atendimento com o intervalo de slots desejado; suporta grade geral da empresa e grade individual por profissional via barra de seleção de grade.
   - **Financeiro:** cards com receita bruta, total de confirmados, ticket médio, taxa de confirmação, cancelados e pendentes do período; seletor de mês no cabeçalho; bar chart de receita por dia e donut chart de distribuição por serviço.
   - **Configurações:** 3 seções independentes — Dados da Empresa (nome, slug, whatsapp), Dados da Conta (username, e-mail) e Alterar Senha.

### Cliente (página pública)

1. Acessa `/{slug}` sem login.
2. **Passo 1:** vê os cards de serviços e seleciona **um ou mais** (multi-select com toggle). Cada card selecionado exibe badge "Selecionado". Um painel flutuante abaixo dos cards mostra o total de serviços, duração somada e preço total. O botão "Continuar →" libera os passos seguintes.
3. **Passo 2 (condicional):** se a empresa tiver mais de 1 profissional ativo, exibe cards para escolha do profissional. Se tiver exatamente 1, seleciona automaticamente e pula o passo. Se não tiver nenhum, pula o passo.
4. **Passo 3:** escolhe a data num seletor de calendário visual (grade mensal 7×N com navegação); a interface busca os slots disponíveis via API (passando a duração total de todos os serviços selecionados) e exibe botões de horário — slots sem espaço suficiente aparecem riscados e desabilitados; dia sem horário cadastrado exibe card vermelho informativo.
5. **Passo 4:** preenche nome e WhatsApp e confirma o agendamento; o resumo lista cada serviço escolhido com sua duração, mais o total de tempo e valor.

---

## O que foi implementado (Frontend)

### Implementação inicial (MVP)

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
- [x] Botão "Copiar link" na sidebar — componente isolado `CopyLinkButton` (estado próprio, não re-renderiza o layout pai); copia `{origin}/{slug}` via `navigator.clipboard`; feedback visual "Copiado!" por 2 segundos; ícones `Copy`/`Check` sempre presentes no DOM, visibilidade controlada por CSS para evitar `insertBefore` crash
- [x] Mensagem de dia fechado na página pública — ao selecionar data sem horário cadastrado, exibe card vermelho com "{empresa} não atende em {dia, data}"; estado `loadingSlots` corretamente zerado no early return do `useEffect`
- [x] `publicApi` — cliente axios separado para rotas públicas (`api/public.ts`) sem interceptores de auth; evita que token expirado redirecione `/login` e limpe localStorage durante navegação pública
- [x] Aba "Hoje" na página de Agendamentos — primeira aba e padrão ao abrir o dashboard; filtra pela data atual via `isToday()` no frontend, sem chamada extra à API
- [x] Polling silencioso na página de Agendamentos — `setInterval` de 30s atualiza a lista sem exibir spinner; pausa quando a aba do browser está em segundo plano (`document.hidden`); indicador discreto "atualizando..." no cabeçalho; intervalo único criado na montagem via padrão `useRef` para evitar stale closure
- [x] Botão "WhatsApp" nos cards — aparece nos status `pendente` e `confirmado`; mensagem pré-formatada em pt-BR com nome do cliente, serviço, data completa, horário e valor em BRL; formatação bold/italic nativa do WhatsApp via `*texto*` e `_texto_`; reutiliza a mesma janela do browser com `window.open(url, 'whatsapp_panel')`
- [x] Exclusão de agendamento com confirmação inline — botão "Excluir" disponível em todos os cards; ao clicar, substitui o botão pela confirmação diretamente no card sem abrir modal; confirmação pendente descartada automaticamente ao trocar de aba

### v1.1 — Profissionais, Financeiro, Seleção de Profissional

- [x] Paleta de cores revisada — `--primary: #60a5fa` (azul bebê), `--success: #4ade80` (verde calmo); todos os `rgba()` hardcoded derivados atualizados em `index.css`
- [x] Tipos `Profissional`, `ProfissionalPublico` e `FinanceiroResumo` adicionados a `types/index.ts`; `Agendamento` e `HorarioFuncionamento` atualizados com campos `profissional` nullable
- [x] `api/profissionais.ts` — CRUD privado de profissionais + `getFinanceiroResumo()`
- [x] `api/public.ts` — `listProfissionaisPublicos()` e `profissional_id` em `getHorariosDisponiveis()`
- [x] `PublicPage.tsx` — passo de seleção de profissional condicional: suprimido se `profissionais.length <= 1`; auto-seleciona o único profissional; numeração dos passos ajustada dinamicamente; profissional aparece no resumo do booking
- [x] `FinanceiroPage.tsx` — 3 cards com receita bruta, confirmados e ticket médio; formata valores com `Intl.NumberFormat` em BRL; rota `/dashboard/financeiro`
- [x] `DashboardLayout.tsx` — nav link "Financeiro" com ícone `TrendingUp` (lucide-react)

### v1.2 — Design System, Tema Dark/Light, Redesign Completo

- [x] `ThemeContext.tsx` — provider de tema dark/light com persistência em `localStorage`; aplica `data-theme="dark"` no `<html>`; tema escuro como padrão na primeira visita; `useTheme()` expõe `theme` e `toggleTheme()`
- [x] `index.css` reescrito — CSS custom properties separadas em paleta de tema (`:root` / `[data-theme="dark"]`) e paleta de marca; variáveis: `--bg`, `--surface`, `--surface-hover`, `--border`, `--text`, `--text-muted`, `--primary`, `--primary-soft`, `--accent`, `--accent-soft`, `--success`, `--danger`, `--warning`; radius `12px`/`8px`; sombras e transições centralizadas em `--shadow-sm/md/lg` e `--t`
- [x] Tipografia: `Inter` (Google Fonts) via `<link>` no `index.html`; `lang="pt-BR"` aplicado; `<title>` alterado para `DevFlow - Agenda`
- [x] Design System — `components/Button.tsx` (variantes: primary/success/accent/ghost/danger/secondary/whatsapp; tamanhos: sm/md/lg; prop `loading` com spinner inline); `components/Badge.tsx` (todos os 4 status + `novo`); `components/Modal.tsx` (backdrop blur, animação slideUp, botão de fechar, slot de footer)
- [x] Dashboard — 4 KPI cards no topo (receita bruta, confirmados, ticket médio, hoje); consumem `GET /api/v1/financeiro/resumo/` em paralelo com a lista de agendamentos; skeleton loader nos cards enquanto carrega
- [x] Sidebar premium — logo com gradiente linear (azul→roxo), indicador lateral no item ativo, toggle sol/lua no rodapé da sidebar, seção `sidebar-bottom` separada com borda sutil
- [x] Bottom navigation mobile — `<nav class="mobile-nav">` fixo na parte inferior; sidebar ocultada em viewport ≤768px; `padding-bottom` no conteúdo para não cobrir cards
- [x] Skeleton loaders em todas as listagens (cards de agendamento, linhas de tabela, KPIs, cards de financeiro) — nunca mais spinner de página inteira
- [x] Empty states com ícone lucide em todas as listas vazias (Agendamentos, Serviços, Horários, Financeiro)
- [x] Progress bar dinâmica na página pública — etapas: Serviço → (Profissional) → Data e hora → Seus dados; estado `done/current/pending` calculado a partir do estado de seleção; ícone `<Check>` substitui número nas etapas concluídas
- [x] Cards de serviço redesenhados — preço destacado à direita, `hover: translateX(3px)`, borda colorida ao selecionar
- [x] Avatar de profissional com iniciais geradas dinamicamente (substitui emoji 👤)
- [x] Cards de agendamento com ícones lucide (Calendar, Phone, DollarSign) nas informações
- [x] FinanceiroPage com ícones nos cards (DollarSign, CheckCircle, TrendingUp) e skeleton loader
- [x] Auth pages (Login e Registro) com logo gradiente, layout premium e placeholders descritivos
- [x] Micro-animações: `fadeIn` na troca de página (`.page`), `slideUp` em modais e cards públicos, `translateY(-2px)` em hover de cards, `shimmer` nos skeleton loaders
- [x] Financeiro overhaul — seletor de período (dropdown com últimos 13 meses); 6 KPI cards; barra de progresso da taxa de confirmação; bar chart (`recharts`) receita por dia; donut chart distribuição por serviço; tooltip customizado com variáveis CSS do tema; `recharts` instalado como dependência
- [x] `tsc --noEmit` — zero erros TypeScript após o redesign

### v1.3 — Profissionais, Calendário Visual, Validação, Gráfico de Volume

- [x] `ProfissionaisPage.tsx` — tabela com avatar de iniciais, nome, especialidade e badge de status clicável (toggle ativo/inativo); modal de criação/edição com `Button` e `Modal` do design system; rota `/dashboard/profissionais`; item "Profissionais" com ícone `Users` adicionado ao `NAV_ITEMS` (sidebar + bottom nav mobile)
- [x] `HorariosPage` — barra de seleção de grade (`grade-selector`): botão "Empresa (geral)" e um por profissional ativo; ao trocar a grade a lista filtra os horários corretos e o modal cria com o `profissional` adequado; `api/horarios.ts` atualizado para aceitar `profissionalId`; `listAllProfissionais()` adicionado a `api/profissionais.ts`
- [x] `VolumeChart` em `AgendamentosPage` — bar chart `recharts` mostrando volume total por dia da semana (Seg–Dom); cores e grid adaptativos ao tema via `useTheme()`; skeleton enquanto carrega; consumido de `GET /api/v1/agendamentos/volume/`
- [x] `CalendarPicker` na `PublicPage` — substituiu `<input type="date">`; grade mensal 7×N com navegação mês anterior/próximo via `‹`/`›`; dias passados desabilitados; dia selecionado destacado em `--primary`; hoje em negrito; zero dependências externas
- [x] Descrição opcional nos cards de serviço — exibida abaixo do nome na página pública (`.service-desc`); textarea opcional no modal de criação/edição em `ServicosPage`
- [x] `src/utils/phone.ts` — `formatPhone` (máscara `(XX) XXXXX-XXXX`), `normalizePhone` (extrai dígitos), `isValidPhone` (valida comprimento); aplicados em `RegisterPage` e `PublicPage`; normalização para dígitos puros antes de cada POST à API
- [x] `ServicosPage` — função `validateForm` local com mensagens claras para nome < 2 chars, duração fora de 5–480 min e preço negativo; campo `descricao` com textarea; descrição exibida abaixo do nome na tabela

### v1.4 — Página de Configurações, Branding DevFlow, Animações CSS

- [x] `ConfiguracaoPage.tsx` — 3 seções independentes com save/feedback próprios: **Dados da Empresa** (nome_fantasia, slug + preview do link, whatsapp com máscara + aviso de quebra de bookmarks ao alterar o slug), **Dados da Conta** (username, e-mail) e **Alterar Senha** (senha atual + nova + confirmação); rota `/dashboard/configuracoes`; item "Configurações" com ícone `Settings` no `NAV_ITEMS` (sidebar + bottom nav)
- [x] Cabeçalho de perfil — banner gradiente com avatar circular de iniciais, username, e-mail e empresa + slug; atualiza em tempo real após salvar qualquer seção
- [x] `AuthContext.atualizarEmpresa()` — sincroniza estado global (sidebar, localStorage) após edição da empresa sem relogar
- [x] Branding **DevFlow** na sidebar — texto gradiente azul→roxo acima do nome da empresa; logo com animação `float` (translação 5px, 4s, infinito)
- [x] Novas animações CSS — `@keyframes float`, `fadeInUp`, `scaleIn`, `pulse-soft`, `gradient-shift`; classes `.stagger > *:nth-child(N)` para entradas em cascata; `will-change: transform` em `.kpi-card` e `.card`; `translateX(2px)` no hover dos `.nav-link`
- [x] `api/usuario.ts` + tipo `PerfilUsuario` em `types/index.ts`

### v1.5 — Multi-Select de Serviços na Página Pública

- [x] `PublicPage.tsx` — Passo 1 reescrito como multi-select: cada card tem toggle (clique adiciona/remove); badge "Selecionado" com ícone Check aparece no card ativo; painel `.service-selection-summary` exibe contagem, duração total e preço total; botão "Continuar →" confirma a seleção e libera os passos seguintes; ao mudar a seleção a confirmação é desfeita e os passos seguintes são resetados
- [x] Resumo do agendamento multi-serviço (Step 4) — lista cada serviço selecionado com duração individual; exibe duração total e preço total destacados
- [x] `AgendamentosPage.tsx` — cards do dashboard exibem todos os serviços separados por " + " via `servicos_info`; valor exibido e usado na mensagem WhatsApp é `preco_total`
- [x] `api/public.ts` — `createAgendamentoPublico` envia `servicos_ids[]`; `getHorariosDisponiveis` envia `servicos_ids` como CSV no param `servicos_ids`
- [x] `types/index.ts` — novo `ServicoInfo`; `Agendamento` atualizado com `servicos_info`, `duracao_total_min`, `preco_total`; `servico`/`servico_nome`/`servico_preco` tornados nullable
- [x] `index.css` — `.service-check-badge` (badge "Selecionado" no card) e `.service-selection-summary` / `.service-selection-info` / `.service-selection-count` / `.service-selection-details` (painel de resumo da seleção)

### v1.6 — Focus Mode, Redesign "Hoje", Cards Expandíveis

- [x] Emojis removidos da mensagem WhatsApp — emojis apareciam como losango+`?` fora do WhatsApp Business API; substituídos por formatação nativa do WhatsApp (`*negrito*` e `_itálico_`) em `buildWhatsappUrl` em `AgendamentosPage.tsx`
- [x] Dados financeiros removidos de `AgendamentosPage` — `KpiSection` (4 cards) e `VolumeChart` excluídos do componente; dados financeiros acessíveis exclusivamente em `FinanceiroPage`; `fetchData` refatorado para sempre chamar `listAgendamentos()` sem filtro e filtrar por tab no frontend (mantém `todayCount` e `pendingCount` independentes da aba ativa)
- [x] Interface "focus mode" para agendamentos — `.focus-header` com data atual por extenso e capitalizada em `.focus-date`; contagem discreta `"X agendamentos hoje · Y pendentes"` em `.focus-stats` com `.focus-stats-pending` (`--warning`) visível apenas quando `pendingCount > 0`; indicador `atualizando...` mantido à direita; linha de profissional adicionada ao card com ícone `User`
- [x] Redesign premium da aba "Hoje" — `TodayView` com: separadores de período (Manhã/Tarde/Noite); borda lateral por status (âmbar/verde/cinza, 4px solid); pill de horário semântico com cor herdada do status; hierarquia nome 15px bold → serviços 13px muted → profissional 12px; badge "Em atendimento" com animação `pulse-soft` e ponto pulsante via `::before`; card em progresso com `animation: pulse-border` (glow azul); footer com ações sem expansão; `@keyframes pulse-border` adicionado; CSS antigo de timeline (~70 linhas de dead code) removido; `tsc --noEmit` zero erros
- [x] Card de agendamento expandido — `expandedId: number | null` controla acordeão singleton; `handleToggleExpand(id)` abre o card clicado e fecha qualquer outro; novo componente `ExpandedCardPanel` renderiza inline (sem modal): lista de serviços com duração individual, profissional com avatar de iniciais, botão WhatsApp (`pendente`/`confirmado`) e ações Confirmar · Cancelar · Excluir; `onClick={e => e.stopPropagation()}` no wrapper impede que cliques internos fechem o card; chevron `ChevronDown` rotaciona 180° via `.expand-chevron--open`; `animation: slideUp 0.18s ease` no `.expanded-panel`; 21 classes `.today-*` e `.expanded-*` cobertas no CSS

---

## Decisões técnicas e armadilhas (Frontend)

| Contexto | Problema | Solução adotada |
|---|---|---|
| localStorage corrompido → página em branco | `getMinhaEmpresa()` retornava `undefined` quando a paginação quebrou o `data[0]`. `JSON.stringify(undefined)` grava a string literal `"undefined"` no localStorage. Na próxima inicialização, `JSON.parse("undefined")` lança `SyntaxError` dentro do `AuthProvider`, derrubando o React tree inteiro antes de qualquer rota renderizar | `parseEmpresa()` no `AuthContext` verifica a string `"undefined"`, valida que o objeto tem `slug`, e envolve o parse em `try/catch` — o app nunca trava por estado persistido inválido |
| Rotas públicas usando cliente autenticado | `api/public.ts` importava o mesmo `api` do `client.ts`, que injeta `Authorization: Bearer` em toda requisição e, em caso de 401 (token expirado), executa `window.location.href = '/login'` + `localStorage.clear()`. Ao abrir a página pública com token expirado, o interceptor derrubava a sessão inteira e a página ficava em branco | Criado `publicApi` — instância axios limpa (`axios.create`) sem interceptors de auth em `api/public.ts`; o cliente privado (`client.ts`) permanece inalterado e exclusivo para rotas autenticadas |
| Botão "Copiar link" → `insertBefore` / página em branco (React 19 + React Router 7) | Dois bugs encadeados. **1)** Estado `copied` no `DashboardLayout` re-renderizava o `<Outlet />` inteiro a cada clique, causando página em branco. **2)** Alternar condicionalmente entre `<Copy>` e `<Check>` na mesma posição da árvore JSX faz o reconciliador chamar `insertBefore(parent, newNode, referenceNode)` onde `referenceNode` deixou de ser filho — `Uncaught NotFoundError` | **1)** Extraído `CopyLinkButton` como componente próprio — mudanças de estado não atingem o layout pai. **2)** Ambos os ícones são sempre renderizados no DOM; CSS com classes `.icon-default`/`.icon-copied` controla a visibilidade via `display: none` baseado no modificador `.sidebar-copy-btn--copied`. Nenhum nó DOM é inserido ou removido ao clicar |
| Loading preso ao trocar de serviço com requisição em andamento | O `useEffect` de busca de slots não resetava `loadingSlots` no early return (quando `dataSelecionada` é limpa ao trocar de serviço). Se o usuário trocasse de serviço com uma requisição em andamento, o indicador de carregamento ficava preso na tela | Early return do `useEffect` agora chama `setLoadingSlots(false)` e `setDiaClosed(false)` antes de retornar |
| Polling com stale closure → atualização só no filtro "Todos" | O `setInterval` do polling tinha `[fetchData]` como dependência do `useEffect`. Toda vez que o usuário trocava de aba, `fetchData` era recriado (novo `useCallback`), o intervalo era destruído e recriado — resetando os 30s. Além disso, a versão capturada de `fetchData` dentro do intervalo ficava desatualizada (stale closure), fazendo o poll sempre usar o filtro da aba inicial (`'todos'`) | Padrão `useRef`: `fetchDataRef` guarda sempre a referência mais recente de `fetchData` (atualizado via `useEffect` a cada mudança de `tab`). O `setInterval` é criado **uma única vez** na montagem com deps `[]` e lê `fetchDataRef.current` a cada tick — sem stale closure e sem reset do intervalo ao trocar de aba |
| Emojis renderizados como losango+`?` na mensagem do WhatsApp | Mesmo com `encodeURIComponent` (UTF-8 percent-encoding correto), emojis aparecem como losango+`?` em alguns dispositivos e versões do WhatsApp fora do WhatsApp Business API | Emojis removidos inteiramente da mensagem em `buildWhatsappUrl`. A formatação visual é mantida com marcadores nativos do WhatsApp: `*negrito*` para títulos e campos, `_itálico_` para observações e assinatura |
| Botão WhatsApp abre nova aba a cada clique | `<a target="_blank">` sempre abre uma nova aba no browser, mesmo que uma aba do WhatsApp Web já esteja aberta | Trocado para `<button onClick>` com `window.open(url, 'whatsapp_panel')`. O segundo argumento é o nome da janela: o browser reutiliza a janela existente se ainda estiver aberta; só abre uma nova se o usuário a tiver fechado |
| **[v1.1]** Passo de profissional na `PublicPage` pode quebrar o `useEffect` de slots | Ao trocar de profissional após já ter selecionado data + slot, o estado `profissionalId` muda mas `dataSelecionada` não é zerada — o `useEffect` de slots não seria re-disparado se a dependência fosse só `dataSelecionada` | `profissionalId` foi adicionado ao array de dependências do `useEffect` de slots. Ao trocar de profissional, `dataSelecionada` e `slotSelecionado` são zerados em `handleSelecionarProfissional`, garantindo que o usuário refaça a escolha de data com a grade correta do novo profissional |
| **[v1.1]** `profissionalId = undefined` vs `null` na `PublicPage` | O componente usa `undefined` para "passo suprimido (sem profissionais)" e `null` para "profissional ainda não escolhido (passo ativo)". Enviar `undefined` no payload causaria campos omitidos vs `null` no JSON | No `handleSubmit` e no `useEffect` de slots: `profId = profissionalId === undefined ? null : profissionalId`. O payload enviado ao backend sempre tem `profissional: null` ou `profissional: <id>` — nunca `profissional: undefined` |

---

## 16. Melhorias planejadas (v1.6) 🔜

### Página de Agendamentos

- [ ] **Exibir profissional no card resumido** — o campo `profissional_nome` já vem no serializer mas não aparece no card fechado; adicionar linha com ícone `User` e nome do profissional (ou texto muted "Sem profissional" quando `null`), mantendo alinhamento visual com `Calendar`, `Phone` e `DollarSign`
- [ ] **Badge de status com ação rápida integrada** — clicar no badge `Pendente` diretamente confirma o agendamento com micro-confirmação inline, sem precisar rolar até os botões de ação; badge `Confirmado` oferece ação rápida "Cancelar" no mesmo padrão

### Página Financeiro — cards informativos com tooltips explicativos

> **Motivação:** os 6 KPI cards são exibidos lado a lado, mas os termos são opacos para um prestador sem background financeiro.

- [ ] **Ícone `?` com tooltip em cada KPI card** — cada card recebe um ícone `HelpCircle` (lucide-react) posicionado no canto superior direito; ao hover (desktop) ou toque (mobile) o tooltip aparece com a definição da métrica:
  - **Receita bruta** → _"Total em R$ de todos os agendamentos confirmados no período. Não desconta custos ou cancelamentos."_
  - **Confirmados** → _"Quantidade de agendamentos que você confirmou no período."_
  - **Ticket médio** → _"Valor médio por agendamento confirmado. Calculado dividindo a receita bruta pelo número de confirmados."_
  - **Total no período** → _"Todos os agendamentos criados no período, independentemente do status."_
  - **Cancelados** → _"Agendamentos que foram cancelados por você ou pelo cliente no período."_
  - **Pendentes** → _"Agendamentos aguardando sua confirmação até o momento da consulta."_
- [ ] **Tooltip acessível** — componente `Tooltip` reutilizável em `components/Tooltip.tsx`; `position: absolute` com `z-index` alto; `role="tooltip"` e `aria-describedby` para leitores de tela; desaparece ao pressionar `Esc` ou clicar fora
- [ ] **Layout em grade responsiva para os KPIs** — migrar de `display: flex / flex-wrap` para `CSS Grid` com `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`; em desktop ≥1280px os 6 cards cabem em uma linha; em tablet 768px–1279px: 3×2; em mobile ≤767px: 2×3
- [ ] **Hierarquia visual nos cards** — valor principal em fonte grande e bold (`2rem`); label abaixo em `0.75rem uppercase letter-spacing`; ícone da métrica deslocado para direita do card em opacidade `0.15` como elemento decorativo

### Dashboard — cards de agendamento mais informativos

- [ ] **Resumo completo no card** — revisar layout dos cards para garantir que todas as informações relevantes (serviço, profissional, data/hora, status, valor) sejam visíveis hierarquicamente sem abrir tela adicional

### Auto-refresh aprimorado

- [ ] **Polling inteligente** — backoff exponencial: inicia em 15s e dobra a cada 3 ciclos sem novos dados até máximo de 60s; reset para 15s ao detectar novo agendamento ou ação do usuário
- [ ] **Indicador de "novo agendamento"** — ao detectar agendamentos novos no polling (comparando `criado_em` com timestamp do último fetch), exibir toast/badge de notificação discreta no topo da lista antes de atualizar silenciosamente
- [ ] **Atualização em tempo real via WebSocket (premium)** — substituir polling por Django Channels + WebSocket para push instantâneo; requer infraestrutura adicional (ASGI, Redis) — classificado como feature premium

### Responsividade 100%

- [ ] **Auditoria de breakpoints** — mapear todos os componentes que apresentam overflow ou layout quebrado abaixo de 375px (iPhone SE); priorizar: tabela de Serviços, tabela de Profissionais, cards de Agendamentos, sidebar em telas intermediárias (768px–1024px)
- [ ] **Tabelas → cards em mobile** — converter tabelas de `ServicosPage` e `ProfissionaisPage` para layout de cards empilhados em viewport ≤640px; manter tabela apenas em desktop
- [ ] **Modal responsivo** — componente `Modal` tem largura fixa; adaptar para `width: min(480px, 95vw)` e garantir que conteúdo interno não extrapole em celulares pequenos
- [ ] **Bottom nav completo** — adicionar itens de Financeiro e Configurações ao `mobile-nav` (atualmente só mostra Agendamentos, Serviços, Profissionais, Horários e Tema)
- [ ] **Teclado virtual no mobile** — campos de formulário dentro de modais devem fazer scroll para não ficarem ocultos pelo teclado virtual do iOS/Android; usar `scroll-padding-bottom` ou `scrollIntoView` no `onFocus`
