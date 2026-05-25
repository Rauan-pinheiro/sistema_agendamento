# Backend — SaaS de Agendamento

> **Visão geral do ecossistema** → [`../README_ROOT.md`](../README_ROOT.md)
> **Documentação do Frontend** → [`../frontend/README_FRONTEND.md`](../frontend/README_FRONTEND.md)

Stack: **Python / Django + Django Rest Framework** — SQLite (dev) → MySQL via Cloud SQL (prod).

---

## 4. Models (App: `agendamentos`)

| Model | Campos principais | Herda de |
|---|---|---|
| `Empresa` | `owner` (User), `nome_fantasia`, `slug`, `whatsapp_contato` | `Model` |
| `BaseModel` | `empresa` (FK), `criado_em`, `atualizado_em` | `Model` (abstract) |
| `Profissional` | `nome`, `especialidade`, `ativo` | `BaseModel` |
| `Servico` | `nome`, `descricao`, `duracao_min`, `preco` | `BaseModel` |
| `Agendamento` | `servico` (nullable FK, legado), `servicos` (M2M via `AgendamentoServico`), `profissional` (nullable FK), `nome_cliente`, `whatsapp_cliente`, `data_hora`, `status`, `duracao_total_min`, `preco_total` | `BaseModel` |
| `AgendamentoServico` | `agendamento` (FK), `servico` (FK), `ordem` | `Model` |
| `HorarioFuncionamento` | `profissional` (nullable FK), `dia_semana` (0–6), `hora_inicio`, `hora_fim`, `intervalo_min` | `BaseModel` |

### Grades de horário — lógica de prioridade

`HorarioFuncionamento.profissional` é nullable:
- `NULL` → grade geral da empresa (aplica-se quando nenhum profissional específico é informado)
- Preenchido → grade individual do profissional (prevalece sobre a grade geral)

Ao resolver horários disponíveis para um profissional:
1. Busca grade do profissional (`empresa + profissional + dia_semana`)
2. Se não encontrar, usa a grade geral da empresa (`empresa + profissional=NULL + dia_semana`)
3. Se nenhuma existir, retorna `{ fechado: true }`

> **Por que o `unique_together` foi removido do banco?** MySQL trata `NULL != NULL` em índice único — a constraint `UNIQUE(empresa, profissional, dia_semana)` permitiria múltiplas grades genéricas (todas com `profissional=NULL`) para o mesmo dia. A unicidade é garantida no `HorarioFuncionamentoSerializer` com uma query explícita — ver seção de armadilhas.

### Status do Agendamento

| Valor | Significado |
|---|---|
| `pendente` | Criado pelo cliente, aguardando confirmação do prestador |
| `confirmado` | Confirmado pelo prestador |
| `cancelado` | Cancelado (por qualquer parte) |
| `arquivado` | Movido automaticamente pelo management command após 90 dias |

---

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
| GET | `api/v1/agendamentos/volume/` | Volume por dia da semana (Seg–Dom) e por hora |
| GET / POST | `api/v1/horarios/` | Listar (`?profissional_id=N` ou `?profissional_id=null`) e criar horários |
| GET / PUT / PATCH / DELETE | `api/v1/horarios/{id}/` | Gerenciar um horário de funcionamento |
| GET | `api/v1/financeiro/resumo/` | Resumo financeiro (`?mes=YYYY-MM`, padrão = mês corrente) |
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
> `GET /api/v1/empresa/`, `GET /api/v1/horarios/` e `GET /api/v1/public/{slug}/profissionais/` são **exceções** com `pagination_class = None` — retornam lista simples. Regra: qualquer endpoint com número fixo ou pequeno de registros por tenant deve sobrescrever a paginação.

### Payload do `POST /api/v1/public/{slug}/agendamentos/`

```json
{
  "servicos_ids": [1, 3],
  "profissional": 3,
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
  "total_agendamentos": 50,
  "agendamentos_confirmados": 42,
  "cancelados": 5,
  "pendentes": 3,
  "receita_bruta": "3150.00",
  "ticket_medio": "75.00",
  "taxa_confirmacao": 84.0,
  "por_dia": [...],
  "por_servico": [...]
}
```

---

## O que foi implementado (Backend)

### Implementação inicial (MVP)

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
- [x] Campo `servico_preco` (read-only) no `AgendamentoSerializer` — evita chamada extra ao endpoint de serviços para exibir preço na lista e na mensagem WhatsApp

### v1.1 — Profissionais, Financeiro, Arquivamento

- [x] Model `Profissional` herdando `BaseModel` — `nome`, `especialidade`, `ativo`; CRUD privado em `/api/v1/profissionais/`
- [x] `Agendamento` ganhou FK opcional `profissional`; detecção de conflito agora é por profissional (quando definido) ou empresa-wide (quando `null`)
- [x] `HorarioFuncionamento` ganhou FK opcional `profissional` — `null` = grade geral, preenchido = grade individual; `unique_together` removido do banco e portado para validação no serializer
- [x] `Agendamento.status` ganhou o choice `arquivado`
- [x] `service.py` — camada de lógica desacoplada da view; `calcular_resumo_financeiro(empresa)` agrega `Count`/`Sum` do mês corrente sem model extra
- [x] Endpoint `GET /api/v1/financeiro/resumo/` — delega para `service.py`, retorna `mes_referencia`, `agendamentos_confirmados`, `receita_bruta`, `ticket_medio`
- [x] `HorariosDisponiveisView` aceita `?profissional_id=N`; resolve a grade com prioridade: grade do profissional → grade geral da empresa; conflitos de slot filtrados pelo profissional correto
- [x] Endpoint público `GET /api/v1/public/{slug}/profissionais/` — lista profissionais ativos (sem paginação, sem autenticação)
- [x] Management command `arquivar_agendamentos` — flags `--dias N` (padrão 90) e `--dry-run`; move agendamentos `confirmado`/`cancelado` com `data_hora` anterior ao limite para status `arquivado`; isolamento por tenant garantido pela FK `empresa` em cada registro

### v1.2 — Financeiro (overhaul)

- [x] `service.py` estendido — `calcular_resumo_financeiro(empresa, mes_ref?)` aceita mês arbitrário; retorna 10 campos: `total_agendamentos`, `confirmados`, `cancelados`, `pendentes`, `receita_bruta`, `ticket_medio`, `taxa_confirmacao`, `por_dia[]`, `por_servico[]`; isolamento tenant mantido
- [x] `FinanceiroResumoView` com seletor de mês — aceita `?mes=YYYY-MM`; valida o formato antes de processar; padrão continua sendo o mês corrente

### v1.3 — Validação, Volume, Descrição de Serviço

- [x] `Servico.descricao` (TextField, blank=True) — migration `0004_servico_descricao`; campo opcional exibido na página pública abaixo do nome do serviço
- [x] `GET /api/v1/agendamentos/volume/` — action no `AgendamentoViewSet`; `calcular_volume_agendamentos(empresa)` em `service.py` retorna volume por dia da semana (Seg–Dom) e por hora; agregação em Python com `Counter` para consistência SQLite↔MySQL
- [x] Validação completa em todos os serializers — `_validar_telefone_br()` (DDD brasileiro + 10–11 dígitos), `nome_cliente` min 2 chars, `duracao_min` 5–480 min, `preco` ≥ 0, `intervalo_min` 5–240 min, `username` mín 3 chars alfanumérico, e-mail único, `data_hora` futura na criação; `.strip()` em todos os campos de texto

### v1.4 — Endpoint de Perfil do Usuário

- [x] `PerfilUsuarioSerializer` + `PerfilUsuarioView` — `GET/PATCH /api/v1/usuario/`; valida username único (mín 3 chars, alfanumérico), e-mail único, troca de senha com verificação da senha atual via `check_password()`

### v1.5 — Multi-Serviço (M2M, Desnormalização)

- [x] `AgendamentoServico` (through model) com campo `ordem` — tabela intermediária M2M `Agendamento↔Servico` que preserva a ordem de seleção do cliente; `unique_together (agendamento, servico)` impede duplicatas
- [x] `Agendamento.servicos` (ManyToManyField through `AgendamentoServico`) — suporte a múltiplos serviços por agendamento; `servico` FK original mantida (nullable) para backward compat
- [x] `Agendamento.duracao_total_min` e `Agendamento.preco_total` — campos desnormalizados gravados na criação; evitam N+1 na detecção de conflitos; garantem precisão no financeiro mesmo que o preço do serviço mude depois
- [x] Migration `0005_agendamento_multi_servico` — torna `servico` FK nullable, cria `AgendamentoServico`, adiciona `servicos` M2M, `duracao_total_min` e `preco_total`; backfill automático (`RunPython`) dos registros existentes
- [x] `AgendamentoSerializer` aceita `servicos_ids: [id, ...]` na escrita; preserva ordem, valida pertença à empresa, auto-popula `servico` FK (primeiro da lista) e calcula totais; `_validar_conflito_horario` usa `duracao_total_min` dos agendamentos existentes
- [x] `servicos_info` (read-only) no `AgendamentoSerializer` — lista `[{id, nome, duracao_min, preco}]` de todos os serviços vinculados; fallback para `servico` FK em dados legados
- [x] `HorariosDisponiveisView` aceita `?servicos_ids=1,2,3` (CSV) — calcula `duracao_total` como soma e usa como janela de slot; backward compat com `?servico_id=N`; detecção de conflito de slots usa `ag.duracao_total_min`
- [x] `service.py` — `calcular_resumo_financeiro` usa `Sum('preco_total')` em vez de `Sum('servico__preco')`, garantindo valor correto para agendamentos multi-serviço

### v1.6 — Slots passados ocultados

- [x] `HorariosDisponiveisView` — slots anteriores ao momento presente (`slot_datetime < timezone.now()`) ignorados antes da verificação de conflitos; `agora = timezone.now()` capturado uma vez antes do loop; eles não aparecem na resposta independentemente de terem agendamento ou não

---

## Decisões técnicas e armadilhas (Backend)

| Contexto | Problema | Solução adotada |
|---|---|---|
| Paginação global + `EmpresaViewSet` | `DEFAULT_PAGINATION_CLASS` no `settings.py` envolve **todos** os ViewSets no envelope `{ count, results }`. Como `getMinhaEmpresa()` fazia `data[0]` esperando uma lista simples, `empresa.slug` virava `undefined` e o link da sidebar gerava `/undefined` | `EmpresaViewSet` recebe `pagination_class = None` explicitamente, pois um usuário sempre tem exatamente 1 empresa. Regra geral: qualquer endpoint que retorna um único objeto ou uma lista de tamanho fixo deve sobrescrever `pagination_class = None` |
| Slots disponíveis sem serviço selecionado | O endpoint `horarios-disponiveis` pode ser chamado sem `?servico_id` | Quando sem `servico_id`, usa `intervalo_min` do horário como duração padrão do slot |
| Fuso horário nos slots | `HorarioFuncionamento` armazena `hora_inicio`/`hora_fim` como `TimeField` (naive). Agendamentos são `DateTimeField` armazenados em UTC | Slots gerados com `timezone.make_aware(..., get_current_timezone())` e a comparação de conflitos é feita entre `aware datetimes`, evitando erros de offset |
| Seleção de data sem horário cadastrado → resposta ambígua | Backend retornava `{ slots: [] }` quando não existe `HorarioFuncionamento` para o `dia_semana` — idêntico ao retorno de dia com todos os slots ocupados; o frontend não conseguia distinguir "dia fechado" de "todos os slots ocupados" | `HorariosDisponiveisView` retorna `'fechado': True` no JSON quando `DoesNotExist`. Frontend lê `r.fechado` e exibe card vermelho com nome da empresa e data específica: _"{empresa} não atende em {dia, data}. Por favor, escolha outra data disponível."_ |
| Slots passados exibidos como disponíveis para hoje | `HorariosDisponiveisView` gerava todos os slots do `HorarioFuncionamento` e descartava apenas os ocupados por `Agendamento`, sem comparar com a hora atual. Ao selecionar hoje, slots do passado (ex: 08:00 às 14:36) apareciam disponíveis | `agora = timezone.now()` capturado uma vez antes do loop; qualquer `slot_datetime < agora` é ignorado com `continue`, sem entrar na verificação de conflitos nem ser adicionado à resposta |
| **[v1.1]** `unique_together` em `HorarioFuncionamento` quebra com `profissional=NULL` no MySQL | Com `profissional` nullable, a constraint `UNIQUE(empresa, profissional, dia_semana)` no banco não protege o caso genérico: MySQL trata `NULL != NULL`, portanto múltiplas linhas `(empresa=1, NULL, 0)` passariam — permitindo duas grades genéricas para o mesmo dia | `unique_together` removido do `Meta`. `HorarioFuncionamentoSerializer.validate()` executa query explícita `HorarioFuncionamento.objects.filter(empresa=..., profissional=..., dia_semana=...).exists()` (com `filter(profissional__isnull=True)` para o caso genérico) e lança `ValidationError` se já existir. SQLite em dev tem o mesmo comportamento — correção consistente entre ambientes |
| **[v1.1]** Conflito de agendamento com múltiplos profissionais | Dois profissionais diferentes podem atender clientes ao mesmo tempo — a lógica original checava conflitos empresa-wide, bloqueando agendamentos simultâneos para profissionais distintos | `AgendamentoSerializer._validar_conflito_horario` agora segmenta a busca: se o novo agendamento tem `profissional != None`, filtra candidatos por `profissional=profissional`; se `profissional=None`, filtra por `profissional__isnull=True`. Agendamentos de profissionais distintos nunca colidem |
| **[v1.1]** Management command + `auto_now=True` em `atualizado_em` | `QuerySet.update()` não dispara `.save()` e portanto não aciona `auto_now=True`. Incluir `atualizado_em=timezone.now()` no `update()` contornaria isso, mas viola a semântica canônica do Django | O comando usa apenas `qs.update(status='arquivado')`. O campo `atualizado_em` reflete a última edição manual do registro, não o arquivamento em lote — comportamento aceitável para uma operação de manutenção |
| **[v1.3]** Migration `0004_servico_descricao` não aplicada → 500 em produção | `GET /api/v1/public/{slug}/servicos/` retornava `Internal Server Error: no such column: agendamentos_servico.descricao`. O Django exibe aviso `You have N unapplied migration(s)` na inicialização, mas sobe normalmente — o erro só aparece em tempo de requisição. O `catch` genérico do `Promise.all` no frontend exibia "Empresa não encontrada", ocultando a causa real | Executar `python manage.py migrate` **sempre** que o Django avisar sobre migrations pendentes. O aviso na inicialização é bloqueante para qualquer endpoint que acesse o model alterado — nunca ignorá-lo |
| **[v1.5]** `preco_total` / `duracao_total_min` desnormalizados vs propriedades computadas | Usar `@property` no model causaria N+1 queries na detecção de conflitos (um SELECT de `servicos` por agendamento existente no loop) e impossibilitaria `Sum('preco_total')` no ORM para o financeiro | Campos armazenados no banco, calculados e gravados em `AgendamentoSerializer.create()` e `update()`. Backfill automático na migration `0005`. Limitação conhecida: `preco_total` reflete o preço **no momento do agendamento** — não muda se o serviço for editado depois (comportamento desejado: preço bloqueado na reserva) |
| **[v1.5]** `unique_together` em `AgendamentoServico` com `(agendamento, servico)` | Um cliente não deve poder selecionar o mesmo serviço duas vezes no mesmo agendamento | `unique_together = [('agendamento', 'servico')]` em `AgendamentoServico.Meta`. No frontend, `toggleServico` usa lógica Set-like (adiciona se ausente, remove se presente) — impossível duplicar pelo cliente. A constraint no banco é a linha de defesa final |
| **[v1.5]** `servicos_ids` write field vs `servicos` M2M no serializer | Se o serializer declarasse um campo `servicos = PrimaryKeyRelatedField(many=True)`, o DRF tentaria gerir o M2M automaticamente via `field.set()`, o que não funciona com through model customizado (`AgendamentoServico` com `ordem`) | Campo de escrita nomeado `servicos_ids` (ListField de ints) — nome diferente do campo M2M evita conflito com o DRF. Em `validate()`, os IDs são resolvidos e armazenados em `_servicos_list` (chave temporária no `validated_data`). Em `create()`, esse valor é popped antes de `super().create()` e os `AgendamentoServico` são criados manualmente com o campo `ordem` |
