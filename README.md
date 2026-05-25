# SaaS de Agendamento Multi-Tenant — Visão Geral do Monorrepo

> **Documentação detalhada por camada:**
> - API e modelos de dados → [`backend/README_BACKEND.md`](backend/README_BACKEND.md)
> - Interface, design system e UX → [`frontend/README_FRONTEND.md`](frontend/README_FRONTEND.md)
>
> Backlogs técnicos, histórico de implementações e armadilhas conhecidas vivem dentro de cada subpasta acima. Este arquivo concentra apenas as decisões de produto e infraestrutura que afetam o ecossistema como um todo.

---

## 1. Visão Geral

Sistema SaaS focado em prestadores de serviços (barbearias, clínicas, etc.). Cada assinante possui um ambiente isolado para gestão de horários, serviços e clientes, além de uma página pública acessada via slug para receber agendamentos de clientes finais.

---

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

---

## 3. Estrutura Multi-Tenant (Isolamento de Dados)

- Estratégia: **Shared Database, Isolated Rows** (isolamento via chave estrangeira).
- `Empresa` é o Tenant. Todo model de negócio herda de `BaseModel`, que carrega uma `ForeignKey` obrigatória para `Empresa`.
- Cada empresa possui um `slug` único que gera sua página pública de agendamentos.
- O isolamento é aplicado nas views: `get_queryset` sempre filtra por `empresa=request.user.empresa`, garantindo que um prestador nunca acesse dados de outro.

---

## 10. Pendente para v1.0 (antes do deploy)

> Todos os itens abaixo são de infraestrutura global e devem ser concluídos antes do primeiro deploy em produção.

- [ ] **Variáveis de ambiente** — extrair `SECRET_KEY`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS` para `.env` com `python-decouple` ou `django-environ`
- [ ] **WhiteNoise** — instalar e configurar para o Django servir o build do React em produção
- [ ] **Build do frontend** — rodar `npm run build` e copiar o `dist/` para dentro do projeto Django (ou configurar o `Dockerfile` para fazer isso no build)
- [ ] **Dockerizar o backend** — criar `Dockerfile` para o Django (imagem base `python:3.x-slim`, instalar dependências, copiar código, rodar `gunicorn`)
- [ ] **docker-compose para desenvolvimento** — `docker-compose.yml` subindo Django + MySQL localmente com um único `docker compose up`, substituindo a necessidade de dois terminais separados
- [ ] **Deploy no GCP Cloud Run** — criar projeto no GCP, configurar Cloud SQL (MySQL) na região `southamerica-east1`, fazer push da imagem para o Artifact Registry e deploy no Cloud Run; configurar `ALLOWED_HOSTS`, `SECRET_KEY` e `DATABASE_URL` via variáveis de ambiente do Cloud Run

---

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
v1.4 → página de Configurações (empresa + conta + senha), branding DevFlow, animações CSS,
        endpoint /api/v1/usuario/ ✅ (implementado)
v1.5 → seleção múltipla de serviços (M2M com ordem, duracao_total_min, preco_total,
        multi-select na página pública) ✅ (implementado)
v1.6 → separação Agendamentos × Financeiro (privacidade), redesign premium aba "Hoje",
        cards expandíveis ✅; pendente: tooltips nos KPIs financeiros, layout grid responsivo,
        auto-refresh inteligente, responsividade 100%
v1.7 → deploy GCP (Cloud Run + Cloud SQL), WhiteNoise, Dockerfile, variáveis de ambiente
v1.8 → features premium (WhatsApp automático, pagamento online), sistema de planos e cobrança
```

**Como implementar tecnicamente (quando chegar a hora):**

1. Adicionar campo `plano` em `Empresa` com choices (`basico`, `profissional`, `premium`)
2. No backend, checar `request.user.empresa.plano` nas views que controlam features premium antes de executar a ação — retornar `HTTP 403` com mensagem de upgrade se o plano não cobrir
3. No frontend, o dashboard lê o plano da empresa (já retornado em `GET /api/v1/empresa/`) e oculta ou bloqueia visualmente as features indisponíveis, exibindo um prompt de upgrade no lugar
4. Integrar MercadoPago ou Stripe: ao assinar, o gateway dispara um webhook que atualiza `empresa.plano` — acesso liberado instantaneamente sem intervenção manual
