# Roadmap de produto

> Ideias de funcionalidades e de monetização para depois do lançamento, movidas do README antigo
> em 22/10/2026. Não fazem parte do escopo do primeiro deploy.

## Funcionalidades Premium (planos avançados / atualizações futuras)

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
