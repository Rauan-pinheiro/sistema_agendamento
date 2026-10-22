# 04 — Simulação local de produção

Data: 22/10/2026 · Branch: `fase-7-simulacao-producao` (empilhada sobre `fase-6-correcoes`)

## Veredito: o deploy deve funcionar

Tudo o que dá para provar sem uma conta no Render foi provado localmente, com os mesmos
comandos, versões, variáveis, headers e limites de CPU e memória do `render.yaml`. O que só
o deploy real mostra está na seção 7.

| Verificação | Resultado |
|---|---|
| `render.yaml` contra o **schema oficial do Render** | ✅ válido |
| Variáveis de ambiente do código documentadas | ✅ 43 da API e 2 do front, todas nos `.env.example`; as obrigatórias estão no `render.yaml` |
| API com gunicorn + `gunicorn.conf.py`, `DEBUG=false`, Postgres 17 | ✅ sobe em ~2 s; `check --deploy` sem problemas |
| Migrations a partir do **banco vazio** | ✅ 0001 → 0011; `migrate --check` limpo |
| Migrations a partir de uma **cópia de dados** da versão anterior | ✅ 1.200 agendamentos e R$ 116.780,00 iguais antes e depois; 0 itens divergentes |
| Build do front como o Static Site, servido com os headers e a CSP do `render.yaml` | ✅ **0 violações de CSP** na jornada completa |
| CORS | ✅ só a origem do front recebe `Access-Control-Allow-Origin` |
| CSRF (admin) | ✅ login com token passa; sem token: 403; cookies `Secure` |
| Rotas do React (SPA) | ✅ `/dashboard/financeiro` e `/<slug>` abrem direto (rewrite → `index.html`) |
| HTTPS | ✅ HTTP → 301 para HTTPS; HSTS na API e no front; health check interno por HTTP responde 200 |
| IP real nos logs atrás do proxy | ✅ o campo `ip` mostra o cliente, nunca o IP da borda |
| Jornada completa no navegador (celular 360 px e desktop) | ✅ 0 erros de console, 0 falhas de rede, 0 HTTP ≥ 400 |
| Teste de carga (50 usuários, k6) | ✅ 0,00% de erro, 23,8 req/s (ver seção 5) |
| Mídia: upload assinado, leitura, remoção, órfãos e alerta | ✅ com o provedor `local` (ver seção 6) |

## 1. Como a simulação reproduz o Render

`simulacao/` (instruções em `simulacao/README.md`), tudo em Docker:

| Render (`render.yaml`) | Simulação |
|---|---|
| Postgres **Basic 256 MB** (0,1 CPU), versão 17 | `postgres:17-alpine`, `cpus: 0.1`, `mem_limit: 256m` |
| Web Service **Starter** (0,5 CPU, 512 MB), Python 3.13.5 | `python:3.13.5-slim`, `cpus: 0.5`, `mem_limit: 512m` |
| `buildCommand: pip install -r requirements.txt` | mesmo comando no `Dockerfile` |
| `preDeployCommand: python manage.py migrate --noinput` | roda antes de subir a API, num contêiner à parte |
| `startCommand: gunicorn … -c gunicorn.conf.py` | mesmo comando |
| Mesmas variáveis (`DJANGO_DEBUG=false`, `DB_POOL`, `NUM_PROXIES=1`, `LOG_FORMATO=json`, CORS, CSRF, admin) | `docker-compose.yml`, com segredos de teste gerados na hora |
| Borda do Render: TLS, proxy com `X-Forwarded-For`/`Proto` | Caddy com certificado local |
| Static Site: `npm ci && npm run build`, headers, CSP e rewrite | mesmo build (Node 22, `VITE_API_URL` da simulação); o `Caddyfile` é **gerado a partir do `render.yaml`** (`gerar_caddyfile.py`), então qualquer mudança nos headers é testada aqui |

**Únicas diferenças:** domínios `localhost` no lugar de `*.onrender.com` (a CSP troca só o
domínio da API) e o provedor de mídia `local` no lugar do Cloudinary (a CSP inclui a API em
`img-src`/`media-src`, porque as mídias saem dela).

## 2. Migrations

- **Banco vazio:** `0001_initial` … `0011_agendamentoservico_preco` aplicadas; `showmigrations` e `migrate --check` limpos.
- **Cópia de dados existentes** (`./simular.sh migracoes`): a versão anterior (`fase-5-prontidao`)
  cria e popula um banco (3 empresas, 1.200 agendamentos). Ele é copiado com `pg_dump`/`pg_restore`
  (o mesmo caminho de um backup lógico) e a versão atual migra a cópia:

  | | Agendamentos | Receita registrada |
  |---|---|---|
  | Antes | 1.200 | R$ 116.780,00 |
  | Depois | 1.200 | R$ 116.780,00 |

  Agendamentos cuja soma dos itens difere do total: **0**. Agendamentos sem item: **0**.

## 3. Front, headers, CSP, CORS e CSRF

- Headers do front iguais aos do `render.yaml`: CSP, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS, `Cache-Control` imutável em `/assets/*`.
- **CSP:** a jornada completa (cadastro, serviço com foto, vídeo e YouTube, grade, reserva com "Ver mais",
  painel, anexo e lightbox, financeiro, exportar e excluir conta, termos e privacidade) rodou com
  **0 violações** nos dois tamanhos de tela. Prova de que o detector funciona: um script inline e
  uma imagem de `example.com` injetados à força foram bloqueados e reportados.
- **CORS:** preflight de `https://localhost:9443` → permitido; de `https://site-malicioso.com` → sem
  `Access-Control-Allow-Origin` (o navegador bloqueia).
- **CSRF:** login no admin (`/painel-simulacao/`) com token → 302; sem token → 403. `/admin/` → 404.
- **SPA:** abrir direto `/dashboard/financeiro` ou `/<slug>` devolve o `index.html` (200).
- ⚠️ **Ponto para conferir no deploy real:** a regra `Cache-Control: no-cache` do `render.yaml` vale
  para o caminho literal `/index.html`. Quando o `index.html` é servido em `/` ou numa rota do
  React, a regra não casa (na simulação, sai sem `Cache-Control`). Se o Render fizer o mesmo, o
  navegador pode guardar um `index.html` antigo por algum tempo depois de um deploy. A verificação
  está no passo a passo (docs/05, pós-deploy), com a correção caso aconteça.

## 4. API atrás do proxy

- `GET /api/v1/health/` por HTTP interno (como o health check do Render) → 200, sem redirecionar.
- Qualquer outra rota por HTTP → 301 para HTTPS.
- **IP real:** com `NUM_PROXIES=1`, os logs JSON mostram `172.20.0.1` (o seu computador) e
  `172.20.0.5` (outro contêiner), e nunca `172.20.0.4` (a borda). É o comportamento esperado no Render.

## 5. Teste de carga (k6, 50 usuários por 2 min)

`./simular.sh carga`: 35 clientes (página pública, horários, reserva), 10 donos (painel) e 5 logins
repetidos, com o front otimizado da Fase 1, passando pela borda HTTPS. Base com 10 empresas ×
1.500 agendamentos.

| Endpoint | Requisições | p50 (ms) | p95 (ms) | p95 na Fase 1 (ms) |
|---|---|---|---|---|
| Página pública | 698 | 2 | 742 | 360 |
| Horários disponíveis | 698 | 7 | 87 | 40 |
| Criar agendamento | 698 | 5 | 31 | 94 |
| Login | 134 | 21 | 162 | 256 |
| Painel: agendamentos | 159 | 22 | 858 | 615 |
| Painel: resumo | 159 | 6 | 369 | 288 |
| Painel: financeiro | 159 | 14 | 178 | 64 |
| Painel: volume | 159 | 10 | 76 | 73 |
| Painel: serviços | 159 | 6 | 77 | 15 |

**3.033 requisições (23,8/s), 0,00% de erro, nenhum agendamento duplicado.** API com 153 MB de
512 MB; banco com 83 MB de 256 MB. Os picos (máx. 1,5–2 s) acontecem no início, com o cache e o
pool de conexões ainda frios, como na Fase 1.

Nesta simulação os limites de requisição foram folgados, porque os 50 usuários do k6 saem do mesmo
IP. Em produção, cada cliente tem o seu IP e os limites normais valem.

> ⚠️ **Estes números não são os de produção.** O teste roda no seu computador, sem a latência
> Brasil ↔ Virgínia (~120–150 ms por ida e volta) e com o Docker do Windows dividindo a CPU. O número
> real só sai rodando o k6 contra o Render depois do deploy (docs/05, pós-deploy).

## 6. Armazenamento de mídia

Sem credenciais do Cloudinary, a simulação usa o provedor **`local`** (criado na Fase 1 deste
trabalho, `agendamentos/midia_local.py`), que implementa o **mesmo contrato** (`ProvedorMidia`): o
navegador recebe `upload_url` + `campos` assinados e não sabe qual provedor está por trás.

| Etapa | Resultado (pela borda HTTPS) |
|---|---|
| Upload assinado (foto e vídeo, anexos e vitrine) | ✅ 200; assinatura adulterada → 401; formato errado → 400; reenvio → 409 |
| Confirmação (formato detectado pelo conteúdo) | ✅ 201 |
| Leitura de anexo privado pela URL assinada | ✅ 200 `image/jpeg`; sem assinatura → 404 |
| Vitrine pública ("Ver mais") | ✅ foto, vídeo e YouTube carregam sem violar a CSP |
| Remoção (anexo, serviço e exclusão de conta) | ✅ os arquivos somem do armazenamento |
| `limpar_midia_orfa` | ✅ upload nunca confirmado é removido; arquivo novo (< 24 h) é preservado |
| `verificar_uso_midia` | ✅ abaixo do alerta → código 0; acima → código 1 (é o que gera o e-mail do Render) |

O que **só o Cloudinary real** confirma (passo a passo no docs/05): a assinatura aceita pela API
deles, as transformações de imagem (miniaturas) e o número real de créditos. Os testes automatizados
já cobrem a assinatura no formato do Cloudinary (`test_anexos.py`).

## 7. O que só o deploy real mostra

1. Latência real (Brasil ↔ Virgínia) e o p95 em produção: rodar o k6 contra o Render.
2. O número de proxies do Render (esperado: 1). Confira o campo `ip` nos logs com o celular no 4G.
3. O `Cache-Control` do `index.html` em `/` e nas rotas do React (seção 3).
4. Cloudinary real: upload, miniaturas e créditos.
5. Tempo de build e de cold start no plano Starter.

## 8. Arquivos novos

- `simulacao/` — `docker-compose.yml`, `simular.sh`, `gerar_caddyfile.py`, `verificar_navegador.mjs`, `README.md`.
- `scripts/validar_render_yaml.py` — schema oficial + coerência + variáveis documentadas.
- `backend/.env.example` e `frontend/.env.example` (item 1 da Fase 3, adiantado porque o validador depende deles).
- `backend/Dockerfile` alinhado ao Render (Python 3.13.5, `gunicorn.conf.py`, migrations à parte).
- `loadtest/rodar.sh` voltou a funcionar com as guardas de produção.
