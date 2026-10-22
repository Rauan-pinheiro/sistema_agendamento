# 03 — Correções e dívida técnica

Data: 22/10/2026 · Branch: `fase-6-correcoes` (empilhada sobre `fase-5-prontidao`)

## Resultado

| Verificação | Antes | Depois |
|---|---|---|
| Back-end (Django) | 126 testes | **145 testes, todos passando** |
| Front-end (Vitest) | 53 testes, só utilitários | **67 testes**, agora com componentes (Testing Library + jsdom) |
| E2E (Playwright, desktop + celular) | 24 | **22, todos passando** (os 2 removidos só tiravam screenshots) |
| Lint (ESLint) | 0 problemas | 0 problemas |
| Build de produção | ok | ok |
| `manage.py check --deploy` | 0 problemas | 0 problemas (2 avisos de HSTS silenciados com justificativa, ver docs/02) |
| `makemigrations --check` | limpo | limpo (nova migração `0011` incluída) |
| `pip-audit` | 0 vulnerabilidades | 0 vulnerabilidades |
| `npm audit` | **1 alta** (`follow-redirects`, via axios) | **0** |
| gitleaks (114 commits, todas as branches) | — | **0 vazamentos** |

## 1. Falhas e avisos encontrados ao rodar tudo

- `npm audit`: `follow-redirects` com vulnerabilidade alta (cabeçalhos de credencial em redirecionamentos). Corrigido com `npm audit fix`.
- `loadtest/rodar.sh` usava `DJANGO_SECRET_KEY=loadtest`, que a guarda da Fase 5 agora recusa. Será corrigido na simulação de produção (docs/04).
- Nenhuma outra falha ou aviso.

## 2. Itens de código do backlog do docs/02

### Financeiro "por serviço" (#18 da Fase 1)
- **Problema:** um agendamento com Corte + Barba (R$ 60) contava os R$ 60 inteiros para o Corte, e o gráfico usava o preço *atual* dos serviços.
- **Correção:** `AgendamentoServico.preco` guarda o preço de cada item no momento da reserva. O resumo financeiro soma por item, e `servicos_info` mostra o preço da época.
- **Migração `0011_agendamentoservico_preco`** preserva os dados existentes:
  - o `preco_total` já registrado é dividido entre os itens na proporção do preço atual (o último item absorve o arredondamento, então a soma dos itens é sempre igual ao total);
  - agendamentos antigos que só tinham a FK `servico` ganham um item com o total inteiro.
  - A receita bruta de nenhum mês muda.
- Testes: `test_financeiro.py` (inclui a migração rodada sobre dados no estado `0010`).

### Testes dos comandos
- `arquivar_agendamentos`: arquiva só confirmados e cancelados antigos (de todas as empresas), respeita `--dias` e `--dry-run`.
- `popular_carga`: dados consistentes (soma dos itens = total), pode rodar de novo sem duplicar, não toca empresas reais.
- **Nova trava:** `popular_carga` cria donos com senha conhecida. Com `DEBUG` desligado ele só roda com `--forcar` (usado no teste de carga). Evita rodá-lo por engano em produção.

### Testes de componentes React
- **Página pública, carrinho:** soma de preço e duração, remover itens, profissional obrigatório quando há equipe.
- **Página pública, formulário:** horários ocupados desabilitados, validação de nome e WhatsApp, envio com dados normalizados, tela de confirmação, horário tomado por outra pessoa.
- **Galeria de anexos:** lista com cota, upload (assinar → enviar → confirmar → recarregar), arquivo inválido, remoção com confirmação, cota cheia.
- **Páginas legais:** nenhum CPF, CNPJ ou marcador aparece; o WhatsApp é o canal da LGPD.

## 3. Responsável legal (Termos e Política)

- `frontend/src/pages/legal/PaginasLegais.tsx` tem uma constante única, `RESPONSAVEL`: **Rauan Pinheiro Lima, pessoa física**, WhatsApp **(88) 98868-4207** (`https://wa.me/5588988684207`).
- **Sem CPF** nas páginas e no repositório. Sem CNPJ, razão social ou "empresa" para o responsável. Os textos na 1ª pessoa do plural ("Podemos", "Nossa") passaram a falar em "o responsável".
- **LGPD:** o WhatsApp é o canal para acesso, correção, exclusão e demais direitos, com resposta em **até 15 dias**.
- **Marcadores que você preenche depois (opcionais):**
  - `email: '[E-MAIL]'`: enquanto estiver assim ou vazio, **não aparece** nas páginas. Quando preencher com um e-mail válido, ele aparece ao lado do WhatsApp.
  - `foro: ''`: vazio = "foro do domicílio do responsável". Pode virar "Cidade/UF".
- Um comentário no arquivo explica o que trocar ao abrir uma ME (razão social, `qualidade`, `cnpj`, revisão do foro, versões).
- `VERSAO` = 22 de outubro de 2026 e `TERMOS_VERSAO` = `2026-10-22` (novos cadastros gravam essa versão).
- ⚠️ **Os textos precisam ser revisados por um advogado** antes de cobrar o primeiro cliente (em especial: limitação de responsabilidade, foro, papel de controlador como pessoa física e a dispensa de encarregado para agentes de pequeno porte, Resolução CD/ANPD nº 2/2022).

## 4. Limpeza do repositório

- Removidos: `.pyc` versionado (`backend/config/__pycache__`), `.vscode/settings.json` (preferência pessoal), `frontend/README.md` (texto do template do Vite), `e2e/zz-captura.spec.ts` (só tirava screenshots, não testava nada), um JSDoc duplicado em `api/anexos.ts` e o docstring padrão do Django em `config/urls.py`.
- `.gitignore` na **raiz**: `.env*` (exceto `.env.example`), bancos `*.sqlite3`, `node_modules`, `dist`, `venv`, uploads (`media/`, `uploads/`, `midia-local/`), resultados brutos do k6 (`k6.json`, `api.log`), relatórios do E2E, cobertura.
- Conferido: `db.sqlite3`, `e2e.sqlite3`, `seed.py`, `venv/` e builds **nunca** foram versionados. Sem `TODO`, `FIXME`, `console.log` ou `debugger` no código.
- Os resultados versionados em `loadtest/resultados/` são só resumos (`k6.txt`, `docker-stats.csv`) usados pelo docs/01: sem dados pessoais.

## 5. Segredos no código e no histórico

- **gitleaks v8.28** sobre os 114 commits de todas as branches: **nenhum vazamento**.
- Busca complementar (o gitleaks não tem regra para chaves do Django): `django-insecure-…`, `cloudinary://`, `api_secret`, chaves privadas, tokens de AWS, GitHub e Resend.
  - **`SECRET_KEY` de desenvolvimento antiga** (`django-insecure-chwrcr…`), commitada no início do projeto e ainda presente em `test_seguranca.py` como exemplo de chave que a aplicação **recusa**. Já era conhecida (C2 no docs/02). Ela **nunca** é usada em produção: o Render gera uma chave nova (`generateValue`) e a aplicação não sobe com chave `django-insecure`.
  - `api_secret='segredo'` e `api_key='123456'`: valores falsos dos testes.
  - Nenhum `.env`, banco ou chave privada jamais foi commitado.
- **Recomendação: não reescrever o histórico.** A única chave exposta é de desenvolvimento e já está invalidada pela guarda. Reescrever exigiria force-push em todas as branches. Se ainda assim quiser, me peça.

## 6. Jornadas manuais pela interface

Ambiente local: API com SQLite próprio e o novo provedor de mídia `local` (ver abaixo), front no Vite. Roteiro automatizado com Playwright, com screenshots revisados, em **celular (360 × 780)** e **desktop (1366 × 820)**: cadastro → serviço com foto, vídeo e YouTube → grade dos 7 dias → reserva pela página pública (com "Ver mais") → painel (agendamento, anexo e lightbox) → financeiro → profissionais → exportar dados → excluir conta → termos e privacidade. O roteiro também registra erros de console, respostas HTTP ≥ 400 e rolagem horizontal.

**Bugs encontrados e corrigidos:**

| # | Onde | Problema | Correção |
|---|---|---|---|
| 1 | Página pública | Quando a API recusava o horário (reservado por outra pessoa), a mensagem de erro ficava **dentro do formulário que sumia**: o cliente só via a grade recarregar, sem explicação (achado pelo teste de componente) | Aviso aparece em "Quando?" e some ao escolher outro horário |
| 2 | Cadastro | `pattern="[a-z0-9-]+"` é inválido no modo `v` dos navegadores atuais (erro no console): a validação do link era **ignorada** | Hífen escapado |
| 3 | Horários (celular) | Tabela larga: coluna "Intervalo" cortada e **Editar/Excluir fora da tela** | Mesmo padrão de cartões das telas Serviços e Profissionais |
| 4 | Financeiro (celular) | Cartão "Taxa de confirmação" vazava da borda esquerda | Layout flexível com quebra de linha |
| 5 | Configurações | Prévia do link público mostrava um domínio fixo errado (`devflow.app/…`) | Usa o endereço real do site |
| 6 | Configurações | Placeholder `••••••••` na senha atual parecia campo preenchido | "Sua senha atual" |
| 7 | Horários | Erro do formulário sem `role="alert"` (leitor de tela não anunciava) | Adicionado |

Depois das correções, o roteiro rodou de novo **sem nenhum achado** (0 erros de console, 0 HTTP ≥ 400, 0 rolagem horizontal).

### Provedor de mídia `local` (novo)
Não havia como testar upload sem conta no Cloudinary (o E2E intercepta a rede). `agendamentos/midia_local.py` implementa o mesmo contrato (`ProvedorMidia`): upload multipart com campos assinados (HMAC com a `SECRET_KEY`), formato detectado pelo conteúdo, anexos privados só com URL assinada e com validade, sem sobrescrever. Ativado com `MIDIA_PROVEDOR=local`. **O `settings.py` recusa subir com ele no Render** (o disco de lá é apagado a cada deploy). Testes: `test_midia_local.py`.

## 7. Backlog (fica para depois, não bloqueia o deploy)

| Prioridade | Item | Observação |
|---|---|---|
| Médio | Horários: cadastrar os 7 dias exige 7 cliques em "Adicionar dia" | Sugestão: "copiar para todos os dias" ou modelo pronto (seg–sáb 8h–18h) |
| Médio | Recuperação de senha por e-mail | Contorno: `changepassword` (ver docs/06) |
| Médio | Sentry, retenção automática de dados de clientes, refresh token em cookie HttpOnly | Igual ao docs/02 |
| Baixo | Abas do painel no celular: "Confirmados" fica parcialmente fora da tela | A faixa rola na horizontal; funciona, mas pode não ser óbvio |
| Baixo | Agrupamento do financeiro é pelo **nome** do serviço | Dois serviços com o mesmo nome somam juntos (mesmo comportamento de antes) |
