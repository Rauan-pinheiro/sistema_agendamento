# Projeto: SaaS de Agendamento Multi-Tenant

## 1. Visão Geral
Sistema SaaS focado em prestadores de serviços (barbearias, clínicas, etc.). Cada assinante possui um ambiente isolado para gestão de horários, serviços e clientes, além de uma página pública acessada via slug para receber agendamentos de clientes finais.

## 2. Arquitetura e Stack
- **Backend:** Python / Django + Django Rest Framework
- **Banco de Dados:** SQLite (desenvolvimento) → MySQL via Railway (produção)
- **Frontend:** React (planejado — consumirá a API REST)
- **Infra:** Deploy na plataforma Railway
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

## 5. API REST — Endpoints

### Autenticação JWT
| Método | Rota | Descrição |
|---|---|---|
| POST | `api/v1/auth/token/` | Login — retorna `access` (60 min) e `refresh` (7 dias) |
| POST | `api/v1/auth/token/refresh/` | Renova o `access` token usando o `refresh` |

### Área privada (requer `Authorization: Bearer <token>`)
| Método | Rota | Descrição |
|---|---|---|
| GET / PATCH | `api/v1/empresa/` | Dados da empresa do usuário logado |
| GET / POST | `api/v1/servicos/` | Listar e criar serviços |
| GET / PUT / PATCH / DELETE | `api/v1/servicos/{id}/` | Gerenciar um serviço |
| GET / POST | `api/v1/agendamentos/` | Listar (`?status=pendente`) e criar agendamentos |
| GET / PUT / PATCH / DELETE | `api/v1/agendamentos/{id}/` | Gerenciar um agendamento |
| PATCH | `api/v1/agendamentos/{id}/status/` | Confirmar ou cancelar um agendamento |

### Área pública (sem autenticação, via slug)
| Método | Rota | Descrição |
|---|---|---|
| GET | `api/v1/public/{slug}/` | Info da empresa (nome, slug, whatsapp) |
| GET | `api/v1/public/{slug}/servicos/` | Serviços disponíveis da empresa |
| POST | `api/v1/public/{slug}/agendamentos/` | Cliente cria um agendamento |

## 6. Fluxos de Usuário
1. **Dashboard do Prestador:** Autenticado via JWT. Gerencia serviços, visualiza e atualiza agendamentos.
2. **Página do Cliente:** Acessada via `slug` sem login. O cliente vê os serviços e solicita um horário.

## 7. O que foi implementado

- [x] Models `Empresa`, `BaseModel`, `Servico` e `Agendamento` com relacionamentos e campos de auditoria
- [x] `Serializers` com validação de integridade: o serviço de um agendamento deve pertencer à mesma empresa
- [x] `ViewSets` com isolamento de Tenant por `get_queryset` e injeção de empresa via `perform_create`
- [x] Roteamento com `DefaultRouter` (rotas privadas) + `path()` manual (rotas públicas com slug)
- [x] Migration inicial (`0001_initial`) gerada e aplicada
- [x] Script `seed.py` para popular o banco em desenvolvimento
- [x] `.gitignore` configurado (ignora `venv`, `__pycache__`, `.env`, `*.sqlite3`, `seed.py`, IDEs)
- [x] API testada e validada: JSON correto, isolamento funcionando, 401 sem autenticação
- [x] Autenticação JWT com `djangorestframework-simplejwt` — login, uso do token e refresh testados
- [x] `requirements.txt` gerado com todas as dependências do projeto
- [x] Endpoint de registro de Empresa + criação automática do User vinculado (`POST /api/v1/auth/registro/`)
- [x] Alteração de status do Agendamento pelo prestador — `PATCH /api/v1/agendamentos/{id}/status/`
- [x] Regra de negócio: impedir agendamentos em horários já ocupados (validação de sobreposição no serializer, cobre rotas privada e pública)
- [x] Endpoint público `GET /api/v1/public/{slug}/` — info básica da empresa para cabeçalho da página do cliente
- [x] Campo `servico_nome` (read-only) no `AgendamentoSerializer` — evita chamadas extras no frontend
- [x] Ordenação padrão dos agendamentos por `data_hora` ascendente

## 8. Próximos Objetivos
- [x] CORS configurado para integração com o frontend React (`django-cors-headers`, origem `http://localhost:5173`)
- [ ] Paginação nas listagens
- [ ] Deploy no Railway com banco MySQL
