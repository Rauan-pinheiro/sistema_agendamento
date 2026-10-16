#!/usr/bin/env bash
# Simula o plano gratuito do Render localmente e roda o cenário de 50 usuários.
#
#   API      : 0.1 CPU / 512 MB  (Render Free web service)
#   Postgres : 0.1 CPU / 256 MB  (Render Free Postgres)
#
# Uso: ./rodar.sh <rotulo> [variáveis extras para a API, ex.: "-e DB_CONN_MAX_AGE=60"]
# Variáveis: GUNICORN_ARGS (padrão: config do Render "gunicorn config.wsgi"), K6_EXTRA
set -euo pipefail
cd "$(dirname "$0")"

ROTULO=${1:?informe um rótulo, ex.: antes}
API_ENV=${2:-}
GUNICORN_ARGS=${GUNICORN_ARGS:-""}
NET=agenda-lt
OUT=resultados/$ROTULO
mkdir -p "$OUT"

limpar() { docker rm -f lt-api lt-db >/dev/null 2>&1 || true; }
limpar
docker network create $NET >/dev/null 2>&1 || true

echo ">> Postgres"
docker run -d --name lt-db --network $NET --cpus=0.1 --memory=256m \
  -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=agenda postgres:16-alpine >/dev/null
until docker exec lt-db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2

echo ">> Build da API"
docker build -q -t agenda-api ../backend >/dev/null

DB=postgres://postgres:pg@lt-db:5432/agenda
COMMON="-e DATABASE_URL=$DB -e DJANGO_DEBUG=false -e DJANGO_SECRET_KEY=loadtest -e DJANGO_ALLOWED_HOSTS=*"

echo ">> Migrate + dados sintéticos (sem limite de CPU)"
docker run --rm --network $NET $COMMON agenda-api sh -c \
  "python manage.py migrate -v0 && python manage.py popular_carga --empresas 10 --historico 1500"

echo ">> API limitada a ${API_CPUS:-0.1} CPU / 512 MB  (gunicorn: ${GUNICORN_ARGS:-padrão})"
# shellcheck disable=SC2086
docker run -d --name lt-api --network $NET --cpus=${API_CPUS:-0.1} --memory=512m $COMMON $API_ENV \
  -e GUNICORN_CMD_ARGS="$GUNICORN_ARGS" -p 8000:8000 agenda-api \
  gunicorn config.wsgi:application --bind 0.0.0.0:8000 >/dev/null
T0=$(date +%s)
until curl -sf -o /dev/null http://localhost:8000/api/v1/public/carga-1/; do
  sleep 2
  if (( $(date +%s) - T0 > 120 )); then
    echo "!! API não respondeu em 120 s"; docker logs --tail 40 lt-api; limpar; exit 1
  fi
done
echo ">> API pronta em $(( $(date +%s) - T0 )) s (cold start a 0.1 CPU)" | tee "$OUT/cold-start.txt"

echo ">> Coletando memória/CPU a cada 2s"
( while docker inspect lt-api >/dev/null 2>&1; do
    docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' lt-api lt-db 2>/dev/null \
      | sed "s/^/$(date +%s),/"
    sleep 2
  done ) > "$OUT/docker-stats.csv" &
STATS_PID=$!

echo ">> k6 — 50 VUs"
MSYS_NO_PATHCONV=1 docker run --rm --network $NET -v "$(pwd -W 2>/dev/null || pwd):/scripts" \
  -e BASE_URL=http://lt-api:8000 -e SAIDA=/scripts/$OUT/k6.json ${K6_EXTRA:-} \
  grafana/k6 run --quiet /scripts/${SCRIPT:-cenario-50-usuarios.js} | tee "$OUT/k6.txt" || true

kill $STATS_PID 2>/dev/null || true
docker logs lt-api > "$OUT/api.log" 2>&1 || true
echo ">> Agendamentos duplicados (mesmo horário/empresa/profissional, não cancelados):"
docker exec lt-db psql -U postgres -d agenda -tAc "
  SELECT count(*) FROM (
    SELECT empresa_id, coalesce(profissional_id,0), data_hora FROM agendamentos_agendamento
    WHERE status NOT IN ('cancelado','arquivado') AND nome_cliente='Cliente Carga'
    GROUP BY 1,2,3 HAVING count(*)>1) d;" | tee "$OUT/duplicados.txt"
limpar
echo ">> Resultados em $OUT"
