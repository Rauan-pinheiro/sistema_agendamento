# Imagem usada na simulação local de produção (simulacao/) e no teste de carga (loadtest/).
# O Render NÃO usa este arquivo: ele roda o runtime Python nativo com os comandos do
# render.yaml. Aqui reproduzimos os mesmos passos e versões.
FROM python:3.13.5-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .

# Mesmo startCommand do render.yaml. As migrations rodam antes, à parte (preDeployCommand).
CMD ["gunicorn", "config.wsgi:application", "-c", "gunicorn.conf.py"]
