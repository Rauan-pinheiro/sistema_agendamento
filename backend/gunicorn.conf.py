"""
Configuração do gunicorn para o Render (instâncias pequenas, 0,1–0,5 CPU).

1 processo + threads: com CPU fracionária, mais processos não trazem mais CPU,
só consomem RAM (~70 MB cada). As threads sobrepõem a espera por I/O (banco),
e um único processo mantém o cache local e o pool de conexões coerentes.
"""
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get('WEB_CONCURRENCY', '1'))
worker_class = 'gthread'
threads = int(os.environ.get('GUNICORN_THREADS', '4'))
timeout = 60
graceful_timeout = 20
keepalive = 5
# Recicla o processo periodicamente para conter vazamentos de memória
max_requests = 2000
max_requests_jitter = 200
accesslog = '-'
