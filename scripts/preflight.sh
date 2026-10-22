#!/usr/bin/env bash
# Verificação antes do deploy: roda tudo o que precisa passar e imprime um resumo OK/FALHA.
#
#   bash scripts/preflight.sh            # completo (inclui E2E, ~3 min)
#   bash scripts/preflight.sh --rapido   # sem E2E
#
# Requisitos: venv do back-end com requirements-dev.txt (pip install -r backend/requirements-dev.txt),
# Node 22 com as dependências do front (npm ci) e, para o E2E, `npx playwright install chromium`.
# Docker é opcional (varredura de segredos com gitleaks).
# Sai com código 1 se qualquer etapa falhar: não faça o deploy nesse caso.
set -uo pipefail
cd "$(dirname "$0")/.."
RAIZ=$(pwd)
PY="$RAIZ/backend/venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$RAIZ/backend/venv/bin/python"
[ -x "$PY" ] || { echo "venv do back-end não encontrado: crie com 'python -m venv backend/venv'"; exit 1; }
RAPIDO=false; [ "${1:-}" = "--rapido" ] && RAPIDO=true
LOG=$(mktemp -d)
declare -a NOMES RESULTADOS

etapa() {  # etapa "<nome>" <comando...>
  local nome=$1; shift
  printf '%-52s' "$nome"
  local arq="$LOG/$(echo "$nome" | tr -c 'a-zA-Z0-9' '_').log"
  if "$@" >"$arq" 2>&1; then
    echo "OK"; NOMES+=("$nome"); RESULTADOS+=("OK")
  else
    echo "FALHA"; NOMES+=("$nome"); RESULTADOS+=("FALHA")
    echo "    └─ últimas linhas ($arq):"; tail -n 15 "$arq" | sed 's/^/       /'
  fi
}
aviso() { printf '%-52s%s\n' "$1" "AVISO: $2"; NOMES+=("$1"); RESULTADOS+=("AVISO"); }

# Chave descartável só para o check --deploy (nunca é usada de verdade)
CHAVE=$("$PY" -c "import secrets; print(secrets.token_urlsafe(64))")
api() { (cd "$RAIZ/backend" && "$@"); }
front() { (cd "$RAIZ/frontend" && "$@"); }

echo "Preflight do deploy — $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
echo
[ -n "$(git status --porcelain)" ] && aviso "Árvore do git" "há mudanças não commitadas (o Render publica só o que está no GitHub)"

echo "── API ──"
etapa "Testes (manage.py test)"                api "$PY" manage.py test --noinput
etapa "Migrations em dia (makemigrations --check)" api "$PY" manage.py makemigrations --check --dry-run
etapa "Configuração de produção (check --deploy)" api env DJANGO_DEBUG=false DJANGO_SECRET_KEY="$CHAVE" "$PY" manage.py check --deploy --fail-level WARNING
etapa "Dependências sem vulnerabilidades (pip-audit)" api "$PY" -m pip_audit -r requirements.txt --progress-spinner off

echo "── Front ──"
[ -d "$RAIZ/frontend/node_modules" ] || etapa "Instalar dependências (npm ci)" front npm ci --no-audit --no-fund
etapa "Lint (eslint)"                          front npm run lint
etapa "Testes (vitest)"                        front npm test
etapa "Build de produção (tsc + vite)"         front npm run build
etapa "Dependências sem vulnerabilidades (npm audit)" front npm audit --audit-level=high
if $RAPIDO; then
  aviso "E2E (Playwright)" "pulado (--rapido)"
else
  etapa "E2E (Playwright, desktop e celular)"   front npx playwright test --reporter=line
fi

echo "── Deploy ──"
etapa "render.yaml (schema oficial e variáveis)" "$PY" scripts/validar_render_yaml.py
if docker info >/dev/null 2>&1; then
  etapa "Segredos no histórico (gitleaks)" env MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/repo" zricethezav/gitleaks:v8.28.0 git /repo --redact --no-banner
else
  aviso "Segredos no histórico (gitleaks)" "Docker desligado, varredura pulada"
fi

echo
echo "════════════════ RESUMO ════════════════"
falhas=0
for i in "${!NOMES[@]}"; do
  printf '  %-6s %s\n' "${RESULTADOS[$i]}" "${NOMES[$i]}"
  [ "${RESULTADOS[$i]}" = "FALHA" ] && falhas=$((falhas + 1))
done
echo "════════════════════════════════════════"
if [ $falhas -gt 0 ]; then
  echo "FALHA: $falhas etapa(s). Corrija antes do deploy. Logs em $LOG"
  exit 1
fi
echo "OK: tudo pronto para o deploy."
