# Testes de carga

Simulam o plano gratuito do Render localmente com Docker:

| Serviço  | Limite                 | Equivalente no Render      |
|----------|------------------------|----------------------------|
| API      | 0,1 CPU / 512 MB       | Web Service *Free*         |
| Postgres | 0,1 CPU / 256 MB       | Postgres *Free*            |

`API_CPUS=0.5` simula o plano *Starter*.

```bash
./rodar.sh <rotulo> ["-e VAR=valor ..."]                  # cenário de 50 usuários (2 min)
K6_EXTRA="-e MODO=otimizado" ./rodar.sh depois "-e DB_POOL=true"
SCRIPT=corrida.js ./rodar.sh corrida                      # 30 reservas simultâneas no mesmo horário
```

Requer Docker. O script cria Postgres e API em containers, popula 10 empresas com
1.500 agendamentos cada (`manage.py popular_carga`), coleta `docker stats` a cada 2 s
e grava em `resultados/<rotulo>/`: `k6.txt` (resumo), `docker-stats.csv`,
`cold-start.txt` e `duplicados.txt` (agendamentos no mesmo horário — deve ser 0).

Limitação: o teste roda na rede local, sem a latência real entre o Brasil e o Render.
O Render não tem região na América do Sul; a mais próxima é Virgínia (EUA), o que soma
algo como 120–150 ms de ida e volta por requisição (estimativa — meça no seu deploy).
