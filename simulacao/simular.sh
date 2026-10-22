#!/usr/bin/env bash
# Simulação local de produção (docs/04-simulacao-producao.md). Requer Docker e Node 22.
#
#   ./simular.sh subir        valida o render.yaml, faz o build do front como o Render,
#                             sobe Postgres + API (gunicorn, DEBUG off) + borda HTTPS e
#                             roda as migrations a partir do banco vazio (preDeployCommand)
#   ./simular.sh dados        popula empresas de exemplo (popular_carga --forcar)
#   ./simular.sh migracoes    migra uma CÓPIA de um banco com dados criados pela versão
#                             anterior (branch fase-5-prontidao) e confere os totais
#   ./simular.sh carga        roda o k6 (50 usuários) contra a simulação
#   ./simular.sh parar        derruba tudo e apaga os volumes
#
# Front: https://localhost:9443 · API: https://localhost:8443 (certificado local: aceite o aviso)
set -euo pipefail
cd "$(dirname "$0")"
RAIZ=$(cd .. && pwd)
PY="$RAIZ/backend/venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$RAIZ/backend/venv/bin/python"
DC="docker compose"

garantir_env() {
  [ -f .env ] && return
  # Segredos só de teste, gerados na hora (simulacao/.env está no .gitignore)
  {
    echo "DJANGO_SECRET_KEY=$(openssl rand -hex 48)"
    echo "DB_SENHA=$(openssl rand -hex 16)"
  } > .env
}

esperar_api() {
  local t0=$SECONDS
  until curl -skf -o /dev/null https://localhost:8443/api/v1/health/; do
    sleep 2
    if (( SECONDS - t0 > 180 )); then echo "!! API não respondeu"; $DC logs --tail 50 api; exit 1; fi
  done
  echo ">> API pronta em $(( SECONDS - t0 )) s"
}

subir() {
  garantir_env
  echo ">> Validando render.yaml"; "$PY" "$RAIZ/scripts/validar_render_yaml.py"
  echo ">> Caddyfile a partir do render.yaml"; "$PY" gerar_caddyfile.py
  echo ">> Build do front como o Static Site (npm ci && npm run build, VITE_API_URL da simulação)"
  ( cd "$RAIZ/frontend" && npm ci --no-audit --no-fund >/dev/null && VITE_API_URL=https://localhost:8443 npm run build >/dev/null )
  echo ">> Build da API e banco"
  $DC build -q api
  $DC up -d --wait db
  echo ">> preDeployCommand: migrate a partir do banco vazio"
  $DC run --rm --no-deps api python manage.py migrate --noinput
  $DC run --rm --no-deps api python manage.py migrate --check >/dev/null && echo ">> nenhuma migration pendente"
  $DC up -d api borda
  esperar_api
  echo ">> Front: https://localhost:9443  ·  API: https://localhost:8443"
}

dados() {
  $DC run --rm --no-deps api python manage.py popular_carga --empresas 10 --historico 1500 --forcar
}

migracoes() {
  # 1) Banco criado e populado pela versão anterior (antes da migration 0011)
  local wt="$RAIZ/../.simulacao-fase5"
  rm -rf "$wt"; git -C "$RAIZ" worktree prune
  git -C "$RAIZ" worktree add -q --detach "$wt" fase-5-prontidao
  docker build -q -t agenda-api:fase5 "$wt/backend" >/dev/null
  git -C "$RAIZ" worktree remove --force "$wt"
  local env_db="-e DATABASE_URL=postgres://agenda:$(grep DB_SENHA .env | cut -d= -f2)@db:5432"
  local env="-e DJANGO_DEBUG=false -e DJANGO_SECRET_KEY=$(grep DJANGO_SECRET_KEY .env | cut -d= -f2)"
  $DC exec -T db psql -U agenda -d agenda -qc "DROP DATABASE IF EXISTS exemplo" -c "DROP DATABASE IF EXISTS copia" -c "CREATE DATABASE exemplo" -c "CREATE DATABASE copia"
  echo ">> Versão anterior: migrate + dados de exemplo"
  docker run --rm --network agenda-simulacao_default $env ${env_db}/exemplo agenda-api:fase5 \
    sh -c "python manage.py migrate -v0 && python manage.py popular_carga --empresas 3 --historico 400"
  # 2) Cópia lógica (como um backup do Render) restaurada em outro banco
  echo ">> pg_dump do banco de exemplo → restauração na cópia"
  $DC exec -T db sh -c "pg_dump -U agenda -Fc exemplo | pg_restore -U agenda -d copia --no-owner"
  local antes; antes=$($DC exec -T db psql -U agenda -d copia -tAc "SELECT count(*), sum(preco_total) FROM agendamentos_agendamento")
  # 3) Versão atual migra a cópia
  echo ">> Versão atual: migrate sobre a cópia"
  docker run --rm --network agenda-simulacao_default $env ${env_db}/copia agenda-api:simulacao python manage.py migrate --noinput
  local depois divergentes sem_item
  depois=$($DC exec -T db psql -U agenda -d copia -tAc "SELECT count(*), sum(preco_total) FROM agendamentos_agendamento")
  divergentes=$($DC exec -T db psql -U agenda -d copia -tAc "SELECT count(*) FROM agendamentos_agendamento a WHERE a.preco_total <> (SELECT coalesce(sum(preco),0) FROM agendamentos_agendamentoservico i WHERE i.agendamento_id = a.id)")
  sem_item=$($DC exec -T db psql -U agenda -d copia -tAc "SELECT count(*) FROM agendamentos_agendamento a WHERE NOT EXISTS (SELECT 1 FROM agendamentos_agendamentoservico i WHERE i.agendamento_id = a.id)")
  echo "   agendamentos e receita antes : $antes"
  echo "   agendamentos e receita depois: $depois"
  echo "   agendamentos cuja soma dos itens difere do total: $divergentes"
  echo "   agendamentos sem item: $sem_item"
  [ "$antes" = "$depois" ] && [ "$divergentes" = "0" ] && [ "$sem_item" = "0" ] && echo ">> Migração preservou os dados: OK" || { echo "!! FALHA na migração dos dados"; exit 1; }
}

carga() {
  # Limites folgados: os 50 usuários do k6 saem de um IP só (em produção, cada um tem o seu)
  LIMITE_LOGIN=100000/min LIMITE_PUBLICO=100000/min LIMITE_RESERVA_PUBLICA=100000/hour LIMITE_PAINEL=100000/min \
    $DC up -d --force-recreate api
  esperar_api
  mkdir -p resultados
  MSYS_NO_PATHCONV=1 docker run --rm --network agenda-simulacao_default -v "$(pwd -W 2>/dev/null || pwd)/../loadtest:/scripts" \
    -e BASE_URL=https://borda:8443 -e MODO=otimizado -e K6_INSECURE_SKIP_TLS_VERIFY=true \
    grafana/k6:1.3.0 run --quiet /scripts/cenario-50-usuarios.js | tee resultados/k6.txt
  $DC stats --no-stream | tee resultados/docker-stats.txt
  $DC up -d --force-recreate api   # volta aos limites normais
}

parar() { $DC down -v; }

case "${1:-}" in
  subir|dados|migracoes|carga|parar) "$1" ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac
