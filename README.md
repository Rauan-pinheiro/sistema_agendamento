# AgendaFácil

Sistema de agendamento online por assinatura (SaaS) para prestadores de serviço: barbearias,
salões, estúdios, clínicas. Cada empresa ganha uma **página pública** (`/<slug>`) onde o cliente
escolhe os serviços, o profissional, o dia e o horário e faz a reserva sem criar conta. O dono
gerencia tudo num **painel**: agendamentos (confirmar, cancelar, mandar mensagem no WhatsApp,
anexar fotos e vídeos), serviços com vitrine ("Ver mais" com fotos, vídeos e YouTube),
profissionais, horários de funcionamento, financeiro do mês e privacidade (exportar dados e
excluir a conta, conforme a LGPD).

## Arquitetura

Monorrepo com dois aplicativos. A **API** (`backend/`) é Django 6 + Django REST Framework com
autenticação JWT, multi-tenant por linha (todo dado de negócio pertence a uma `Empresa` e toda
rota privada filtra pela empresa do usuário, com teste de ataque automatizado). Em produção ela
roda no Render como Web Service (gunicorn) com PostgreSQL 17, e um Cron Job diário limpa uploads
órfãos e alerta o consumo de mídia. O **front** (`frontend/`) é React 19 + TypeScript + Vite,
publicado como Static Site separado, com CSP restritiva. Fotos e vídeos não passam pelo
servidor: o navegador envia direto ao **Cloudinary** com uma assinatura gerada pela API (atrás de
uma interface de armazenamento, `agendamentos/midia.py`, que permite trocar de provedor). Toda a
infraestrutura está descrita em [`render.yaml`](render.yaml).

```
Navegador ──► Static Site (React) ──► API Django (gunicorn) ──► PostgreSQL
    │                                     │
    └──── upload direto assinado ────► Cloudinary ◄── Cron diário (órfãos e alerta de uso)
```

## Rodar localmente

Pré-requisitos: **Python 3.13**, **Node 22** e Git. Sem nenhuma configuração, a API usa SQLite e
o modo de desenvolvimento.

```bash
# API (http://localhost:8000)
cd backend
python -m venv venv
venv\Scripts\activate            # Windows  (Linux/macOS: source venv/bin/activate)
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py createsuperuser  # opcional: acesso ao /admin/
python manage.py runserver

# Front (http://localhost:5173), em outro terminal
cd frontend
npm install
npm run dev
```

Abra <http://localhost:5173/register> para criar uma conta. Para ter dados de exemplo:
`python manage.py popular_carga --empresas 1 --historico 40` (login `dono_carga_1` / `Carga-123!`,
página pública `/carga-1`).

**Fotos e vídeos sem Cloudinary:** antes do `runserver`, defina `MIDIA_PROVEDOR=local` (os
arquivos ficam em `backend/midia-local/`). Para usar o Cloudinary, defina `CLOUDINARY_URL`.
Todas as variáveis estão explicadas em [`backend/.env.example`](backend/.env.example) e
[`frontend/.env.example`](frontend/.env.example).

## Testes

| O quê | Comando |
|---|---|
| API (unitários e integração) | `cd backend && python manage.py test` |
| API com cobertura | `cd backend && python -m coverage run manage.py test && python -m coverage report` |
| Front (componentes e utilitários) | `cd frontend && npm test` |
| Lint do front | `cd frontend && npm run lint` |
| E2E (Playwright, desktop e celular; sobe API e front sozinho) | `cd frontend && npx playwright install chromium && npm run e2e` |
| Tudo o que precisa passar antes de um deploy | `bash scripts/preflight.sh` |
| Simulação local de produção (Docker) | [`simulacao/README.md`](simulacao/README.md) |
| Teste de carga (k6) | [`loadtest/README.md`](loadtest/README.md) |

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/05 — Deploy passo a passo](docs/05-deploy-passo-a-passo.md) | **Como publicar no Render**, do zero |
| [docs/06 — Operação](docs/06-operacao.md) | Rotina semanal, clientes, senha, quando subir de plano |
| [docs/02 — Prontidão para o mercado](docs/02-prontidao-para-mercado.md) | Veredito, segurança (OWASP), LGPD, ressalvas |
| [docs/01 — Auditoria e capacidade](docs/01-auditoria-e-capacidade.md) | Testes de carga e escolha dos planos |
| [docs/03 — Correções](docs/03-correcoes.md) · [docs/04 — Simulação de produção](docs/04-simulacao-producao.md) | Histórico das fases finais |
| [backend/README_BACKEND.md](backend/README_BACKEND.md) · [frontend/README_FRONTEND.md](frontend/README_FRONTEND.md) | Modelos, endpoints, fluxos e decisões técnicas |
| [docs/roadmap-produto.md](docs/roadmap-produto.md) | Ideias para depois do lançamento |
