# 02 — Prontidão para o mercado

Data: 19/10/2026 · Branch: `fase-5-prontidao` (empilhada sobre `fase-4-redesign`)

## Veredito: **pronto com ressalvas**

O código está pronto para os primeiros 5 clientes pagantes: a API valida tudo o que antes só o front
validava, o isolamento entre empresas tem teste de ataque automatizado, há rate limiting, headers de
segurança, logs estruturados, LGPD (termos, consentimento, exportação e exclusão) e um `render.yaml`
completo. Nenhum problema crítico ou alto de código ficou aberto.

As ressalvas são de **operação e negócio**, não de código, e precisam ser resolvidas antes de cobrar:

1. **Preencher o responsável e revisar juridicamente** os Termos e a Política
   (`frontend/src/pages/legal/PaginasLegais.tsx`, constante `RESPONSAVEL`). Hoje aparecem como `[Nome ou razão social]`.
2. **Cobrança:** não há integração com provedor de pagamento. Para 5 clientes, dá para cobrar fora do
   sistema (Pix/boleto recorrente) e ativar as contas manualmente. Decisão pendente (ver "Decisões").
3. **Retenção de logs por 6 meses** (Marco Civil, art. 15): o Render guarda pouco tempo. É preciso configurar um *log drain*.
4. **Fazer o primeiro deploy** seguindo o checklist abaixo e medir em produção (latência BR ↔ Virgínia, IP real nos logs).

---

## 1. Status das fases

| Fase | Status | Evidência |
|---|---|---|
| 1. Auditoria e capacidade (50 usuários) | ✅ Feito | `docs/01-auditoria-e-capacidade.md`, `tests/test_performance.py`, `loadtest/` (k6) |
| 2. Mídia nos agendamentos (Cloudinary) | ✅ Feito | `tests/test_anexos.py`, `e2e/painel-anexos.spec.ts` |
| 3. "Ver mais" nos serviços | ✅ Feito | `tests/test_midias_servico.py`, `e2e/ver-mais.spec.ts` |
| 4. Redesign React (design system "Marca-texto") | ✅ Feito | `frontend/src/styles/`, lint 0, Lighthouse ≥ 95, `e2e/acessibilidade.spec.ts` (axe WCAG AA) |
| 5. Prontidão para o mercado | ✅ Feito com ressalvas | este documento |

Na retomada, a Fase 4 tinha um commit "WIP" já enviado. Para concluí-la: E2E quebrado pelo redesign
corrigido, 13 problemas de lint zerados, erros amigáveis com estado "Tentar de novo", contraste do
tema escuro corrigido e `robots.txt`.

## 2. Testes e cobertura

| Suíte | Resultado | Cobertura |
|---|---|---|
| Back-end (Django, unit + integração) | **126 testes, todos passando** | **85% das linhas** (`coverage`; `seguranca.py` e `signals.py` 100%, `views.py` 90%, `serializers.py` 82%) |
| Front-end (Vitest, unitários) | **53 testes, todos passando** | 7% das linhas no total; 68% em `utils/` + cliente HTTP. Componentes e páginas são cobertos pelo E2E |
| E2E (Playwright, desktop + celular) | **24 testes, todos passando** | Fluxos: cliente agenda → dono vê; cadastro com aceite → exportar → excluir conta; anexos; Ver mais; acessibilidade |
| Acessibilidade (axe-core, WCAG 2.1 AA) | **0 violações** | login, página pública (com serviço/horário marcados), 6 telas do painel, termos e privacidade, nos temas claro e escuro |
| Dependências | **0 vulnerabilidades conhecidas** | `npm audit --omit=dev` e `pip-audit` (após atualizar Django, DRF, PyJWT e sqlparse) |
| `manage.py check --deploy` | **0 problemas** | 2 avisos de HSTS silenciados com justificativa (subdomínios do onrender.com) |

Como rodar: `cd backend && python -m coverage run manage.py test && python -m coverage report` ·
`cd frontend && npm run test:coverage && npm run e2e`.

### Lighthouse (build de produção, local)

| Página | Celular (Perf / A11y / Boas práticas / SEO) | Desktop |
|---|---|---|
| Página pública (`/carga-1`) | 95 / 100 / 100 / 100 (LCP 2,7 s, CLS 0) | 100 / 100 / 100 / 100 |
| Login | 97 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Política de privacidade | 97 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

O painel exige login e não é medido pelo Lighthouse: lá a acessibilidade é verificada pelo axe no E2E.

## 3. Problemas encontrados e classificação

### Críticos — todos corrigidos

| # | Problema | Correção | Teste |
|---|---|---|---|
| C1 | A API pública aceitava reservas **fora do horário**, em **dia fechado**, com **profissional inativo** e **sem profissional** numa empresa com equipe. O último caso criava uma agenda paralela "sem profissional" (overbooking) | Regras no serviço (`resolver_grade`, `erro_fora_da_grade`), aplicadas à página pública; profissional inativo recusado também no painel; antecedência máxima de 180 dias | `ValidacaoReservaNaGradeTests` (10 casos) |
| C2 | `SECRET_KEY` antiga no histórico do git | O Render gera uma chave nova (`generateValue`) e a aplicação **se recusa a subir** em produção com chave `django-insecure` ou curta | `ConfiguracaoProducaoTests` |

### Altos — todos corrigidos

| # | Problema | Correção |
|---|---|---|
| A1 | Sem rate limiting (força bruta no login, spam de reservas) | Limites por escopo: login 10/min, cadastro 5/h, reserva pública 30/h, leituras públicas 120/min, painel 600/min (por IP ou usuário, ajustáveis por variável de ambiente) |
| A2 | Atrás do proxy do Render, todos os clientes dividiriam o mesmo IP (um único balde de rate limit) | `NUM_PROXIES=1` por padrão em produção; `IP_HEADER` opcional; teste com dois clientes atrás do proxy |
| A3 | Grade de horários aceitava **profissional de outra empresa** | Validação no serializer; coberta pelo teste de ataque multi-tenant |
| A4 | 48 vulnerabilidades conhecidas nas dependências (Django 6.0.5, PyJWT 2.12.1, DRF, sqlparse) | Django 6.0.9, PyJWT 2.15.1, DRF 3.17.2, sqlparse 0.6.0 (mesma série, sem quebra) |
| A5 | Cadastro e troca de senha aceitavam senhas como `12345678` | Validadores de senha do Django aplicados |
| A6 | Senha errada no login **recarregava a página** e o erro nunca aparecia; depois de um 401 sem refresh token, as próximas requisições **travavam** | Interceptor ignora as rotas de autenticação e libera a fila |
| A7 | Sem headers de segurança | API: HSTS, redirecionamento HTTPS, `nosniff`, `X-Frame-Options: DENY`, COOP, CSP `default-src 'none'`. Front: CSP restritiva (validada contra o build, 0 violações), Permissions-Policy, cache imutável dos assets |
| A8 | LGPD: sem termos, política, consentimento, exportação ou exclusão | Ver seção 5 |
| A9 | Contraste insuficiente no tema escuro do sistema (2,26:1) e cores claras ilegíveis como texto | Cor de texto calculada por contraste; varredura axe no E2E |

### Médios — corrigidos

- Erro 500 sem tratamento: agora retorna JSON amigável com `codigo` (= `X-Request-ID`) e registra o traceback.
- Logs em texto solto: agora em JSON, uma linha por requisição (método, caminho, status, duração, IP, usuário, request id).
- Grade de **segunda-feira** escapava da checagem de duplicidade (`0` tratado como vazio).
- Slugs como `termos`, `privacidade` e `dashboard` podiam ser registrados e sequestrar rotas: agora são reservados.
- Admin em `/admin/`: caminho configurável (`DJANGO_ADMIN_URL`).
- CORS com credenciais sem necessidade: desligado (a API usa JWT no header). Preflight em cache por 1 dia.
- Storage acoplado ao Cloudinary: agora há uma interface única (ver seção 6).

### Backlog (não bloqueia os 5 primeiros clientes)

| Prioridade | Item | Observação |
|---|---|---|
| Alto (operação) | Log drain com retenção de 6 meses | Marco Civil art. 15. Ex.: Better Stack ou Papertrail via "Log Streams" do Render |
| Alto (negócio) | Cobrança recorrente integrada | Decisão de provedor pendente. Até lá, cobrança manual |
| Médio | Recuperação de senha por e-mail | Exige provedor de e-mail (ex.: Resend, SES). Contorno: `python manage.py changepassword <usuario>` no shell do Render |
| Médio | JWT no `localStorage` | Mitigado pela CSP sem `unsafe-inline` em scripts. Evolução: refresh token em cookie `HttpOnly` + blacklist |
| Médio | Financeiro "por serviço" atribui agendamentos com vários serviços ao primeiro (#18 da Fase 1) | Guardar preço por item em `AgendamentoServico` |
| Médio | Rastreamento de erros (Sentry ou similar) | Hoje: logs JSON + `codigo` na resposta para correlacionar |
| Médio | Retenção automática dos dados de clientes finais (ex.: anonimizar após 24 meses) | Hoje: anonimização sob demanda pelo painel |
| Médio | Cache e rate limit em memória do processo | Corretos com 1 processo gunicorn (configuração atual). Ao escalar para mais instâncias, usar Redis (Render Key Value) |
| Baixo | Bloqueio de login por usuário (além do IP) | Não feito de propósito: permitiria travar a conta de um dono conhecido. Reavaliar com CAPTCHA |
| Baixo | Testes unitários de componentes React; comandos `arquivar_agendamentos` e `popular_carga` sem teste | Fluxos cobertos pelo E2E |
| Baixo | HSTS `includeSubDomains`/`preload` | Só com domínio próprio |

## 4. Segurança: OWASP Top 10 (2021)

| Categoria | Situação |
|---|---|
| A01 Controle de acesso | Toda rota privada filtra pela empresa do usuário. `test_multi_tenant.py` tenta ler, alterar, apagar e referenciar dados de outra empresa em **todas** as rotas privadas (CRUD, status, anexos, vitrine, grade) e confere que nada de B mudou |
| A02 Falhas criptográficas | HTTPS obrigatório + HSTS; senhas em Argon2id; URLs de anexos privados assinadas; segredos só em variáveis de ambiente |
| A03 Injeção | ORM do Django (sem SQL cru); React escapa a saída; CSP bloqueia scripts inline (verificado) |
| A04 Design inseguro | Regras de reserva no servidor; lock contra corrida (Fase 1); upload direto assinado com pasta e formatos fixados pelo servidor |
| A05 Configuração | `DEBUG` desligado em produção, chave forte obrigatória, `check --deploy` limpo, admin em caminho próprio, Browsable API desligada |
| A06 Componentes vulneráveis | `pip-audit` e `npm audit` limpos em 19/10/2026 |
| A07 Autenticação | Rate limit de login, validadores de senha, JWT de 60 min com refresh rotativo |
| A08 Integridade | `package-lock.json` e versões fixas no `requirements.txt`; mídia validada pelo conteúdo (magic bytes e formato detectado pelo provedor) |
| A09 Logs e monitoramento | Logs JSON com request id; 500 registrado com traceback; health check com banco |
| A10 SSRF | A API não busca URLs informadas pelo usuário (YouTube é validado por ID, sem requisição) |

## 5. LGPD

- **Termos de Uso e Política de Privacidade** em `/termos` e `/privacidade`: papéis (controlador e operador),
  bases legais, compartilhamento (Render, Cloudinary, YouTube), transferência internacional, retenção, direitos e encarregado.
- **Consentimento:** o cadastro exige marcar o aceite. A API registra `termos_aceitos_em` e `termos_versao`
  (`TERMOS_VERSAO` em `settings.py`). A página pública informa o uso dos dados e leva à política.
- **Portabilidade:** Configurações → Privacidade e dados → "Baixar dados" (JSON com tudo da conta).
- **Exclusão:** "Excluir conta" (pede a senha) apaga empresa, serviços, profissionais, grades, agendamentos **e os arquivos no Cloudinary**.
- **Direitos do cliente final:** "Remover dados de um cliente" (pelo WhatsApp) anonimiza nome e telefone
  e apaga os anexos, só na própria empresa.
- **Testes:** `tests/test_lgpd.py` e `e2e/fluxos-principais.spec.ts`.

## 6. Mídia: abstração e alerta de uso

- `agendamentos/midia.py` é a **interface única** (assinar upload, metadados, URL, tornar público, apagar,
  listar, uso), com o contrato `ProvedorMidia`. O SDK do Cloudinary só é importado em `midia_cloudinary.py`.
- O navegador recebe um descritor genérico (`upload_url` + `campos`) e não conhece o provedor. Migrar para o
  Cloudflare R2 = criar `midia_r2.py` (POST pré-assinado do S3) e trocar `MIDIA_PROVEDOR`.
- **Limites por arquivo:** imagem 10 MB (comprimida no navegador antes do envio), vídeo 100 MB; até 15
  arquivos e 250 MB por agendamento; até 10 arquivos, 150 MB e 3 vídeos do YouTube por serviço. Tudo ajustável por variável de ambiente.
- **Alerta de créditos:** `python manage.py verificar_uso_midia` falha quando o mês passa de **15 dos 25
  créditos** (`MIDIA_ALERTA_CREDITOS`). Roda todo dia no cron do `render.yaml`, junto com a limpeza de órfãos. A falha gera o e-mail de notificação do Render.

## 7. Confiabilidade e operação

- **Erros:** `tratar_excecao` (DRF) responde com JSON amigável e `codigo`. O front mostra mensagens claras
  para falta de conexão, 429 e 5xx (`utils/erros.ts`).
- **Logs:** `LOG_FORMATO=json` em produção; `X-Request-ID` em toda resposta.
- **Health check:** `GET /api/v1/health/` (consulta o banco; 503 se cair), usado pelo Render e sem rate limit.
- **Migrations:** `preDeployCommand: python manage.py migrate` (roda antes de trocar a versão); `makemigrations --check` limpo.
- **Backups (Render, consultado em 19/10/2026):** Postgres pago tem *point-in-time recovery* de **3 dias**
  no workspace Hobby e **7 dias** no Pro, mais *logical backups* sob demanda, guardados por 7 dias.
  Recomendação: um *logical backup* semanal baixado e guardado fora do Render (ver checklist).
- **Monitoramento básico:** notificações de deploy e cron por e-mail no Render, health check, e um monitor
  externo gratuito (ex.: UptimeRobot) a cada 5 min em `/api/v1/health/` e na página pública.

## 8. Checklist de go-live

**Antes do deploy**
- [ ] Preencher `RESPONSAVEL` em `PaginasLegais.tsx`, revisar os textos com um advogado e, se mudar algo, atualizar `VERSAO` e `TERMOS_VERSAO`.
- [ ] Fazer merge das branches das fases na `main` (estão empilhadas: 1 → 2 → 3 → 4 → 5).
- [ ] Criar a conta no Cloudinary e separar a `CLOUDINARY_URL`.

**Deploy (Render → New → Blueprint)**
- [ ] Conferir a prévia do Blueprint (o Render valida o `render.yaml` antes de criar os recursos).
- [ ] Preencher: `CORS_ALLOWED_ORIGINS` (URL do front), `VITE_API_URL` (URL da API), `CSRF_TRUSTED_ORIGINS`, `DJANGO_ADMIN_URL` (ex.: `painel-interno-7k2/`), `CLOUDINARY_URL` (na API e no cron).
- [ ] Se a URL da API não for `agenda-api.onrender.com`, ajustar o `connect-src` da CSP no `render.yaml`.
- [ ] Criar o superusuário pelo shell do serviço: `python manage.py createsuperuser`.

**Depois do deploy**
- [ ] `curl https://<api>/api/v1/health/` → `{"status": "ok"}`.
- [ ] Abrir o front pelo celular e por outra rede e conferir, nos logs da API, que o campo `ip` mostra IPs **diferentes e reais** (não o do proxy). Se não, ajustar `NUM_PROXIES` ou `IP_HEADER`.
- [ ] Testar de ponta a ponta: cadastro → serviço → grade → reserva pela página pública → confirmação no painel → anexar uma foto.
- [ ] Rodar o cron manualmente uma vez ("Trigger run") e conferir a saída do `verificar_uso_midia`.
- [ ] Configurar o log drain (retenção de 6 meses) e o monitor externo de uptime.
- [ ] Criar o primeiro *logical backup* do Postgres e testar a restauração num banco temporário.
- [ ] Rodar o k6 (`loadtest/`) contra produção com 50 usuários e registrar p95.

## 9. Decisões pendentes

**Provedor de cobrança** (antes de integrar, apresento as opções):

| Opção | Prós | Contras |
|---|---|---|
| Manual (Pix/boleto fora do sistema) | Custo zero, começa já | Controle manual de inadimplência e ativação |
| Asaas | Assinatura recorrente com Pix, boleto e cartão; foco no Brasil; webhooks | Taxa por cobrança |
| Mercado Pago (assinaturas) | Marca conhecida pelos clientes | API de assinaturas menos flexível |
| Stripe | API excelente | Pix recorrente e boleto mais limitados no Brasil |

Recomendação: **manual para os 5 primeiros** e Asaas quando passar disso. A integração mínima é um webhook
que marca a empresa como ativa ou inadimplente e um bloqueio suave do painel.

**Provedor de e-mail** (recuperação de senha e avisos): Resend ou Amazon SES.

## 10. Próximos passos priorizados

1. Preencher o responsável e revisar juridicamente os Termos e a Política.
2. Fazer merge na `main` e o primeiro deploy pelo Blueprint, seguindo o checklist (seção 8).
3. Configurar o log drain de 6 meses e o monitor de uptime.
4. Definir a cobrança (manual agora; Asaas depois) e onboarding dos 5 primeiros clientes.
5. Recuperação de senha por e-mail.
6. Backlog médio: financeiro por item, Sentry, retenção automática, refresh token em cookie.
