# 01 — Auditoria técnica e capacidade (50 acessos simultâneos)

> Fase 1 · branch `fase-1-auditoria-performance` · 16/10/2026

## Resumo

- **O plano gratuito do Render não suporta 50 usuários simultâneos com qualidade aceitável**, nem com o código otimizado. Com 0,1 CPU o servidor chega a no máximo ~10 req/s; acima disso as requisições entram em fila e a latência típica sobe para 2–5 s. Além disso, o Postgres gratuito **expira em 30 dias e não tem backup**, o que por si só impede o uso em produção.
- **No plano Starter (0,5 CPU), o código otimizado atende 50 usuários com folga:** p95 entre 15 e 615 ms, zero erros e 23,9 req/s — a vazão ficou limitada pela própria demanda dos usuários simulados, não pelo servidor.
- **O código original não se sustentaria em nenhum plano barato.** No Free, o p50 era de ~16,5 s. Os problemas eram de código, não só de infraestrutura.
- A auditoria encontrou **dois bugs críticos de produto**, ambos corrigidos:
  1. o painel do dono mostrava só os **20 agendamentos mais antigos** — com histórico, os novos nunca apareciam;
  2. **overbooking:** em 30 reservas simultâneas do mesmo horário, **8 foram aceitas** (agora: 1).

**Recomendação mínima:** Web Service Starter (US$ 7/mês) + Postgres Basic‑256mb (US$ 6/mês) ≈ **US$ 13/mês** de infraestrutura, mais o storage de mídia (Fase 2).

---

## 1. Arquitetura mapeada

| Camada | Estado encontrado |
|---|---|
| Back-end | Python 3.13, Django 6.0.5, Django REST Framework 3.17, um único app `agendamentos` |
| Autenticação | JWT (SimpleJWT): access de 60 min, refresh de 7 dias com rotação e sem blacklist. Tokens no `localStorage` do navegador |
| Banco | SQLite fixo no código. O README planejava MySQL no Cloud SQL (GCP), mas a hospedagem prevista agora é o Render, que oferece Postgres |
| Front-end | React 19 + TypeScript + Vite 8, axios, react-router 7, recharts e lucide. Um CSS global de ~2.000 linhas; dark mode já existe (`ThemeContext`) |
| Multi-tenant | Linhas isoladas por FK `empresa`; o filtro é aplicado em cada `get_queryset` |
| Testes | **Nenhum** (`tests.py` vazio) |
| Deploy | Sem Dockerfile, `render.yaml`, servidor WSGI ou configuração por variável de ambiente. `SECRET_KEY` versionada e `DEBUG=True` |

**Modelos:** `Empresa` (tenant, com `slug` público) → `Profissional`, `Servico`, `HorarioFuncionamento` (grade geral ou por profissional) e `Agendamento` (M2M com `Servico` via `AgendamentoServico`, mais os campos desnormalizados `duracao_total_min` e `preco_total`).

**Rotas:** `/api/v1/auth/{registro,token,token/refresh}`; área privada `/api/v1/{empresa,profissionais,servicos,agendamentos,horarios,financeiro/resumo,usuario}`; área pública `/api/v1/public/<slug>/{,servicos,profissionais,agendamentos,horarios-disponiveis}`.

**Fluxos principais:**
- **Cliente:** abre `/<slug>` → escolhe serviços (carrinho) → profissional → data e horário → informa nome e WhatsApp → reserva (status `pendente`).
- **Dono:** login → painel de agendamentos (com polling a cada 15–60 s) → confirma ou cancela → acompanha o financeiro.

## 2. Limites reais do Render (consultados em 16/10/2026)

| Recurso | Free | Starter / pago mínimo |
|---|---|---|
| Web Service | 512 MB, **0,1 CPU** | Starter: 512 MB, 0,5 CPU — US$ 7/mês |
| Spin-down | após **15 min** sem tráfego; voltar leva **~1 min** | não dorme |
| Horas | 750 h por workspace/mês (≈ 1 serviço ligado 24×7) | — |
| Disco | **efêmero**: perdido a cada deploy, restart ou spin-down | efêmero também (disco persistente é pago à parte) |
| Postgres | 1 GB, **expira em 30 dias** (+14 de carência), **sem backups**, sem pool gerenciado | Basic‑256mb: US$ 6/mês (0,1 CPU, 256 MB); Basic‑1gb: US$ 19/mês. Storage a US$ 0,30/GB/mês |
| Conexões Postgres | 100 (instâncias < 8 GB RAM) | 100 |
| Banda de saída | Desde 1º/08/2026, plano Hobby: **5 GB/mês incluídos**, depois US$ 0,15/GB | Pro: 25 GB |
| Regiões | Oregon, Ohio, Virgínia, Frankfurt, Singapura — **nenhuma na América do Sul** | idem |

Fontes: [Render — Free](https://render.com/docs/free), [Render — Postgres: conexões](https://render.com/docs/postgresql-creating-connecting), [Render — Regiões](https://render.com/docs/regions). Preços dos planos e o corte de banda de agosto/2026 vêm de fontes secundárias ([costbench](https://costbench.com/software/developer-tools/render/), [jwatte.com](https://jwatte.com/blog/render-com-platform-review/)); a página oficial de preços não pôde ser lida automaticamente — **confirme no painel antes de contratar**.

> **Os 5 GB de banda pesam na Fase 2:** fotos e vídeos **não devem passar pelo servidor do Render**. O navegador deve enviar direto ao storage e exibir direto do CDN dele.

## 3. Gargalos e problemas encontrados

| # | Problema | Severidade | Status |
|---|---|---|---|
| 1 | Painel do dono buscava só a 1ª página (20 itens) ordenada do **mais antigo** para o mais novo e filtrava as abas no navegador. Com mais de 20 agendamentos, "Hoje", "Pendentes" etc. ficavam incompletos ou vazios | **Crítico** | ✅ Corrigido: filtros no servidor (`data_inicio`, `data_fim`, `status`, `ordem`), "A partir de hoje / Anteriores" e "Carregar mais" |
| 2 | **Overbooking:** a checagem de conflito e a gravação não eram atômicas — 8 de 30 reservas simultâneas no mesmo horário foram aceitas | **Crítico** | ✅ Corrigido: `select_for_update` na empresa + revalidação dentro da transação. Reteste: 1 de 30 |
| 3 | Login custava **~0,5 s de CPU** (PBKDF2 com 1,2 M iterações). A 0,1 CPU, cada login travava o servidor por ~5 s para todos | Alto | ✅ Argon2id com parâmetros OWASP (19 MiB, t=2): 22 ms. Senhas antigas continuam válidas e são migradas no próximo login |
| 4 | N+1 na listagem de agendamentos (25 queries para 20 itens) | Alto | ✅ `prefetch_related` — 6 queries fixas (incluindo a autenticação), com teste que garante isso |
| 5 | Erros 500 não eram registrados em lugar nenhum com `DEBUG=False` | Alto | ✅ `LOGGING` para stdout/stderr (o Render coleta) |
| 6 | `SECRET_KEY` no repositório, `DEBUG=True`, `ALLOWED_HOSTS` vazio, banco fixo | Crítico (em produção) | ✅ Tudo via variável de ambiente; sem `DJANGO_SECRET_KEY` em produção a aplicação não sobe. ⚠️ A chave antiga está no histórico do git: **gere uma nova** |
| 7 | "Volume por dia/hora" lia o histórico inteiro e agregava em Python (custo crescia com a idade da conta) | Médio | ✅ Agregação no banco (fuso local), no máximo 168 linhas |
| 8 | Financeiro fazia 4 contagens separadas | Baixo | ✅ 1 query com agregação condicional |
| 9 | Sem índices em `Agendamento` para empresa + data / status | Médio | ✅ 3 índices compostos (migration `0006`) |
| 10 | Página pública fazia 3 requisições no carregamento e mostrava **no máximo 20 serviços** | Médio | ✅ `/public/<slug>/pagina/`: 1 requisição, até 200 itens, cache de 60 s invalidado por signal quando o dono edita |
| 11 | Polling do painel baixava a lista inteira a cada 15 s por dono logado | Médio | ✅ Polling consulta `/agendamentos/resumo/` (3 contadores) e só recarrega a lista quando há agendamento novo |
| 12 | Bundle JS único de 722 KB: o cliente baixava o painel e a biblioteca de gráficos | Médio | ✅ Code splitting por rota: página pública ~98 KB gzip (antes 218 KB) |
| 13 | Calendário público usava a data UTC: depois das 21h (Fortaleza), "hoje" virava amanhã | Médio | ✅ Data local |
| 14 | `profissional_id`/`servico_id` não numéricos geravam 500 em horários disponíveis | Baixo | ✅ Tratado |
| 15 | Sem pool de conexões e sem servidor WSGI de produção | Alto | ✅ Pool nativo do psycopg 3 (`DB_POOL=true`), gunicorn gthread (1 processo × 4 threads) |
| 16 | Sem compressão HTTP | Baixo | ✅ `GZipMiddleware` (respostas > 200 B) |
| 17 | A API pública aceita reservas **fora da grade de funcionamento** e com profissional inativo (só o front impede) | Alto | ⏳ Fase 5 (validação) |
| 18 | Financeiro "por serviço" atribui o valor total de agendamentos com vários serviços ao primeiro serviço | Médio | ⏳ Backlog: guardar o preço por item em `AgendamentoServico` |
| 19 | Sem rate limiting; JWT no `localStorage`; sem headers de segurança | Alto | ⏳ Fase 5 |
| 20 | 14 erros de lint já existentes no front (`set-state-in-effect`, entre outros) | Baixo | ⏳ Fase 4 |

**Paginação:** as listagens privadas já eram paginadas (20 por página, máximo 100); o problema era o front ignorar isso (#1). **Operações bloqueantes:** não há chamadas externas síncronas hoje; o único trecho bloqueante relevante era o hash de senha (#3).

## 4. Metodologia do teste de carga

- **Ambiente:** Docker local reproduzindo o plano Free: API com `--cpus=0.1 --memory=512m`, Postgres 16 com `--cpus=0.1 --memory=256m`. O Starter foi simulado com `--cpus=0.5`.
- **Dados:** 10 empresas, cada uma com 8 serviços, 3 profissionais, grade de 7 dias e **1.500 agendamentos** espalhados de 6 meses atrás até 30 dias à frente (`manage.py popular_carga`).
- **Ferramenta:** k6, 2 minutos, **50 usuários virtuais simultâneos**:
  - 35 clientes: abrem a página pública → consultam horários → reservam um horário livre (pausa de 1–3 s entre os passos);
  - 10 donos: listagem do painel + polling + financeiro + volume + serviços (pausa de 1–5 s);
  - 5 em login contínuo (a cada 3–6 s).
- **"Antes"** = código do `main` + apenas o necessário para rodar em Postgres/gunicorn (1 worker sync, o padrão). **"Depois"** = esta branch, com o front otimizado simulado (`MODO=otimizado`).
- Scripts e resultados brutos: [`loadtest/`](../loadtest/).

> **O cenário é agressivo de propósito:** cada usuário faz uma ação a cada ~2 s. Um usuário real costuma levar 10–30 s entre ações, o que daria ~5–10× menos carga. Mesmo assim, ele mostra o teto de cada plano.

**Limitação:** o teste roda em rede local. Em produção, some a latência Brasil ↔ Virgínia (estimativa de 120–150 ms por requisição) e, no Free, o cold start.

## 5. Resultados — antes × depois

### Totais

| Cenário | Vazão | Erros | CPU média da API | Memória de pico da API | API pronta após o boot* |
|---|---|---|---|---|---|
| **Antes** · Free (0,1 CPU) | 3,8 req/s | 0,00% | 8,5% (cota saturada) | 71 MB | 8 s |
| **Depois** · Free (0,1 CPU) | 10,1 req/s | 0,00% | 9,5% (cota saturada) | 159 MB | 9 s |
| **Depois** · Starter (0,5 CPU) | 23,9 req/s | 0,00% | 18,7% (sobra ~60%) | 158 MB | 3 s |

\* Tempo do processo até a 1ª resposta. O cold start do Render Free (~1 min) inclui também agendar e iniciar o container.

Zero erros no "antes" **não** significa que estava bom: as requisições esperaram até 24 s na fila. Num navegador real, isso é abandono ou timeout.

### Latência por fluxo (ms)

| Fluxo | Antes Free p50 / p95 | Depois Free p50 / p95 | Depois Starter p50 / p95 |
|---|---|---|---|
| Página pública (antes 3 requisições) | 17.021–17.478 / 21.438–23.144 | 2.995 / 4.760 | **1 / 360** |
| Horários disponíveis | 16.326 / 19.769 | 1.758 / 3.588 | **5 / 40** |
| Criar agendamento | 14.274 / 16.730 | 3.576 / 5.707 | **22 / 94** |
| Login | 16.108 / 20.429 | 3.101 / 5.353 | **19 / 256** |
| Painel — lista | 16.576 / 19.789 | 2.461 / 4.514 | **17 / 615** |
| Painel — resumo (polling) | (lista inteira) | 2.506 / 4.616 | **5 / 288** |
| Financeiro | 15.929 / 17.647 | 2.501 / 5.044 | **10 / 64** |
| Volume | 16.113 / 17.672 | 2.411 / 4.881 | **9 / 73** |

**Meta (p95 < 1,5 s e erros < 1%):** ❌ Free antes · ❌ Free depois · ✅ **Starter depois**.

### Corrida pelo mesmo horário (30 reservas simultâneas)

| | Aceitas | Recusadas | Correto |
|---|---|---|---|
| Antes | **8** | 22 | 1 |
| Depois | **1** | 29 | 1 ✅ |

### Custo de CPU por requisição (núcleo inteiro, medido isoladamente)

| Endpoint | Antes | Queries antes → depois |
|---|---|---|
| Login | 456 ms → ~22 ms (Argon2id) | — |
| Painel — lista | 21,9 ms → 7,0 ms | 25 → 6 |
| Volume | 12,0 ms | agregação em Python → no banco (no SQLite a conversão de fuso continua em Python; no Postgres é nativa) |
| Financeiro | 7,1 ms → 4,6 ms | 8 → 5 |
| Página pública | 3 requisições, ~6,9 ms somados | 1 requisição; 0,4 ms e 0 queries com o cache quente |

## 6. Otimizações aplicadas

**Banco:** índices compostos em `Agendamento`; pool de conexões do psycopg 3 (`DB_POOL=true`, 1–4 conexões); `conn_health_checks`; agregações no banco.
**API:** prefetch (fim do N+1); empresa resolvida uma vez por requisição; endpoint público unificado com cache em memória (60 s) e invalidação por signal; `Cache-Control: public, max-age=30` na página pública; endpoint `/agendamentos/resumo/` para o polling; filtros por período; `GZipMiddleware`; JSON-only em produção.
**Concorrência:** lock por empresa na criação e edição de agendamentos.
**Servidor:** gunicorn `gthread` com 1 processo × 4 threads (com CPU fracionária, mais processos só gastam RAM), `max_requests` para reciclar o processo e `keepalive` de 75 s (corrigiu *connection reset* observado no teste).
**Front:** code splitting por rota, 1 requisição na página pública, polling leve, filtros no servidor.
**Infra:** configuração 100% por variável de ambiente, `Dockerfile`, `gunicorn.conf.py`, health check em `/api/v1/health/` e logs no console.
**Testes:** de 0 para **41 testes** de API (multi-tenant, conflitos, concorrência, cache, número de queries, migração de hash, gzip).

## 7. Veredito de capacidade

| Plano | 50 usuários simultâneos? | Observação |
|---|---|---|
| **Free** | **Não.** Teto de ~10 req/s, latência de 2–5 s sob carga, cold start de ~1 min após 15 min ocioso, banco que expira em 30 dias e sem backup | Serve para demo e homologação |
| **Starter (0,5 CPU) + Postgres Basic‑256mb** | **Sim, com folga** (p95 ≤ 615 ms, ~60% de CPU livre no cenário agressivo) | **Plano mínimo recomendado** — ~US$ 13/mês |
| Standard (1 CPU, 2 GB) | Sim, com folga para ~3–5× mais carga (estimativa, não testado) | Quando passar de ~20–30 empresas ativas ou se o Starter ficar com p95 > 1 s |

**Alternativas ao Postgres pago do Render:**

| Opção | Custo | Prós | Contras |
|---|---|---|---|
| **Render Postgres Basic‑256mb** | US$ 6/mês | Mesma rede da API (menor latência), backups e PITR, um painel só | Pago |
| Neon Free | US$ 0 | 0,5 GB, não expira | Suspende após 5 min ocioso (1ª query lenta); 100 h de compute/mês; rede externa; restore de só 6 h |
| Supabase Free | US$ 0 | 500 MB de banco + 1 GB de storage (útil na Fase 2) | **Pausa após 1 semana sem uso**; rede externa |

**Hospedagem do front:** recomendo publicar o React como **Static Site do Render (gratuito, com CDN e sem spin-down)** e a API como Web Service. A página pública abre instantaneamente mesmo com a API dormindo, e os arquivos estáticos não consomem a CPU da API.

### Estratégia contra o cold start

1. **Melhor solução:** plano Starter, que não dorme.
2. **No Free (demo/homologação):** um ping externo (UptimeRobot ou cron-job.org, ambos gratuitos) em `GET /api/v1/health/` a cada 10–14 min mantém o serviço acordado. Isso consome ~744 h/mês das 750 h gratuitas, ou seja, **só um serviço por workspace** pode ficar ligado 24×7. O health check faz `SELECT 1`, então também mantém viva a conexão com o banco.
3. **Mitigação de UX:** com o front no Static Site, mostrar "Acordando o servidor…" quando a 1ª chamada demorar mais de 3 s, em vez de uma tela em branco (Fase 4).

## 8. Decisões tomadas (16/10/2026)

| Tema | Decisão |
|---|---|
| Banco de produção | **Render Postgres Basic‑256mb** (substitui o plano antigo de MySQL/Cloud SQL) |
| Plano da API | **Web Service Starter**; o Free fica só para homologação |
| Front-end | **Static Site separado** no Render |
| Storage de mídia (Fase 2) | **Cloudinary**, com upload direto e assinado a partir do navegador |

## 9. O que ficou para as próximas fases

- Validar reservas contra a grade de funcionamento e o profissional ativo na API (#17) → Fase 5.
- Rate limiting, headers de segurança, estratégia de tokens e CORS de produção → Fase 5.
- `render.yaml`, checklist de go-live e backups → Fase 5.
- Lint e redesign do front → Fase 4.
- Medir em produção real (latência BR ↔ Virgínia) assim que houver deploy.

### Como reproduzir

```bash
cd backend && python manage.py test agendamentos      # 41 testes
cd loadtest && ./rodar.sh antes                        # ver loadtest/README.md
K6_EXTRA="-e MODO=otimizado" ./rodar.sh depois "-e DB_POOL=true"
API_CPUS=0.5 K6_EXTRA="-e MODO=otimizado" ./rodar.sh starter "-e DB_POOL=true"
SCRIPT=corrida.js ./rodar.sh corrida "-e DB_POOL=true"
```
