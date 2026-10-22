# Simulação local de produção

Reproduz o `render.yaml` na sua máquina para provar que o deploy funciona antes de pagar
pelo Render. Requer **Docker Desktop** ligado, **Node 22** e o venv do back-end com
`pip install -r backend/requirements-dev.txt`. Rode os comandos no Git Bash.

| Comando | O que faz |
|---|---|
| `./simular.sh subir` | Valida o `render.yaml`, faz o build do front como o Static Site, sobe Postgres 17 + API (gunicorn, `DEBUG` off, 0,5 CPU) + borda HTTPS e roda as migrations no banco vazio |
| `./simular.sh dados` | Cria 10 empresas de exemplo (`dono_carga_1` … `10`, senha `Carga-123!`) |
| `./simular.sh migracoes` | Migra uma cópia (pg_dump/pg_restore) de um banco criado pela versão anterior e confere os totais |
| `./simular.sh carga` | Roda o k6 (50 usuários) e salva em `resultados/` |
| `./simular.sh parar` | Derruba tudo e apaga os volumes |
| `node verificar_navegador.mjs` | (da raiz do repositório) Jornada completa no navegador, falha com qualquer violação de CSP, erro ou rolagem horizontal |

- Front: <https://localhost:9443> · API: <https://localhost:8443> (certificado local: aceite o aviso do navegador).
- Os segredos de teste ficam em `simulacao/.env`, gerado na hora e fora do git.
- Diferenças em relação ao Render: mídia no provedor `local` (sem Cloudinary) e domínios
  `localhost`. Resultados e limitações: `docs/04-simulacao-producao.md`.
