"""
Valida o render.yaml antes do deploy.

1. Sintaxe YAML e schema oficial do Render (https://render.com/schema/render.yaml.json;
   sem internet, essa etapa é pulada com aviso).
2. Coerência: referências fromDatabase/fromService existem, rootDir e arquivos do build
   existem, segredos não estão escritos no arquivo, CSP aponta para a API.
3. Variáveis de ambiente: toda variável lida pelo código (back e front) está documentada
   no .env.example correspondente, e as obrigatórias em produção estão no render.yaml.

Uso (na raiz do repositório, com o venv do back-end):
    backend/venv/Scripts/python.exe scripts/validar_render_yaml.py     (Windows)
    backend/venv/bin/python scripts/validar_render_yaml.py             (Linux/macOS)
Sai com código 1 se houver erro.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
SCHEMA_URL = 'https://render.com/schema/render.yaml.json'

# Lidas por bibliotecas ou pela plataforma, não por os.environ no nosso código
IMPLICITAS_API = {'DATABASE_URL', 'CLOUDINARY_URL', 'PYTHON_VERSION'}
IMPLICITAS_FRONT = {'NODE_VERSION'}
# Definidas pelo próprio Render: não vão no render.yaml
DA_PLATAFORMA = {'RENDER', 'RENDER_EXTERNAL_HOSTNAME', 'PORT'}
# Sem padrão seguro: precisam estar no render.yaml da API
OBRIGATORIAS_API = {'DJANGO_DEBUG', 'DJANGO_SECRET_KEY', 'DATABASE_URL', 'CORS_ALLOWED_ORIGINS',
                    'CSRF_TRUSTED_ORIGINS', 'DJANGO_ADMIN_URL', 'CLOUDINARY_URL'}
SEGREDOS = {'DJANGO_SECRET_KEY', 'CLOUDINARY_URL', 'DATABASE_URL'}

erros: list[str] = []
avisos: list[str] = []


def ok(msg: str) -> None:
    print(f'  OK     {msg}')


def vars_do_codigo_api() -> set[str]:
    padrao = re.compile(r"(?:os\.environ\.get|os\.environ\[|os\.getenv|env_bool|env_list)\(?\s*['\"]([A-Z][A-Z0-9_]+)['\"]")
    nomes = set()
    for arq in (RAIZ / 'backend').rglob('*.py'):
        if {'venv', 'tests', 'migrations'} & set(arq.parts):
            continue
        nomes |= set(padrao.findall(arq.read_text(encoding='utf-8')))
    return (nomes - {'DJANGO_SETTINGS_MODULE'}) | IMPLICITAS_API


def vars_do_codigo_front() -> set[str]:
    nomes = set()
    for arq in (RAIZ / 'frontend' / 'src').rglob('*.ts*'):
        nomes |= set(re.findall(r'import\.meta\.env\.(VITE_[A-Z0-9_]+)', arq.read_text(encoding='utf-8')))
    return nomes | IMPLICITAS_FRONT


def vars_documentadas(env_example: Path) -> set[str]:
    if not env_example.exists():
        erros.append(f'{env_example.relative_to(RAIZ)} não existe')
        return set()
    texto = env_example.read_text(encoding='utf-8')
    return set(re.findall(r'^#?\s*([A-Z][A-Z0-9_]+)=', texto, re.M))


def validar_schema(doc: dict) -> None:
    try:
        import jsonschema
        with urllib.request.urlopen(SCHEMA_URL, timeout=15) as r:
            schema = json.load(r)
    except Exception as exc:  # sem internet ou sem jsonschema
        avisos.append(f'schema oficial não verificado ({type(exc).__name__}: {exc})')
        return
    validador = jsonschema.Draft7Validator(schema)
    problemas = sorted(validador.iter_errors(doc), key=lambda e: list(e.path))
    for p in problemas:
        caminho = '/'.join(str(x) for x in p.path) or '(raiz)'
        erros.append(f'schema: {caminho}: {p.message[:200]}')
    if not problemas:
        ok('schema oficial do Render')


def main() -> int:
    arquivo = RAIZ / 'render.yaml'
    print(f'Validando {arquivo.name}')
    try:
        doc = yaml.safe_load(arquivo.read_text(encoding='utf-8'))
    except yaml.YAMLError as exc:
        print(f'  ERRO   YAML inválido: {exc}')
        return 1
    ok('sintaxe YAML')
    validar_schema(doc)

    bancos = {d['name'] for d in doc.get('databases', [])}
    servicos = {s['name']: s for s in doc.get('services', [])}
    api = servicos.get('agenda-api')
    front = servicos.get('agenda-front')
    cron = servicos.get('agenda-rotina-midia')
    if not (api and front and cron):
        erros.append('esperados os serviços agenda-api, agenda-front e agenda-rotina-midia')
        return relatorio()

    # Referências e segredos
    for nome, s in servicos.items():
        for ev in s.get('envVars', []):
            k = ev.get('key')
            if 'fromDatabase' in ev and ev['fromDatabase']['name'] not in bancos:
                erros.append(f'{nome}.{k}: banco {ev["fromDatabase"]["name"]} não existe')
            if 'fromService' in ev and ev['fromService']['name'] not in servicos:
                erros.append(f'{nome}.{k}: serviço {ev["fromService"]["name"]} não existe')
            if k in SEGREDOS and 'value' in ev:
                erros.append(f'{nome}.{k}: segredo escrito no render.yaml (use sync: false, generateValue ou fromDatabase)')
        if s.get('rootDir') and not (RAIZ / s['rootDir']).is_dir():
            erros.append(f'{nome}: rootDir {s["rootDir"]} não existe')
    ok('referências fromDatabase/fromService e nenhum segredo no arquivo')

    for s in (api, cron):
        if not (RAIZ / s['rootDir'] / 'requirements.txt').exists():
            erros.append(f'{s["name"]}: requirements.txt não encontrado')
    if not (RAIZ / 'backend' / 'gunicorn.conf.py').exists() or 'gunicorn.conf.py' not in api['startCommand']:
        erros.append('agenda-api: startCommand deve usar gunicorn.conf.py')
    if 'migrate' not in api.get('preDeployCommand', ''):
        erros.append('agenda-api: preDeployCommand deve rodar as migrations')
    if not front.get('staticPublishPath', '').startswith('./frontend/'):
        erros.append('agenda-front: staticPublishPath deve ser relativo à raiz (./frontend/dist)')
    rotas = front.get('routes', [])
    if not any(r.get('type') == 'rewrite' and r.get('destination') == '/index.html' for r in rotas):
        erros.append('agenda-front: falta o rewrite /* → /index.html (rotas do React)')
    headers = {h['name']: h['value'] for h in front.get('headers', []) if h['path'] == '/*'}
    csp = headers.get('Content-Security-Policy', '')
    if 'connect-src' not in csp or 'agenda-api' not in csp:
        avisos.append('CSP: connect-src não aponta para a API (ajuste se o domínio da API mudou)')
    for h in ('Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Strict-Transport-Security'):
        if h not in headers:
            erros.append(f'agenda-front: header {h} ausente')
    ok('build, pre-deploy, rewrite do SPA e headers de segurança')

    # Variáveis de ambiente
    def chaves(s):
        return {ev['key'] for ev in s.get('envVars', [])}

    codigo_api, codigo_front = vars_do_codigo_api(), vars_do_codigo_front()
    doc_api = vars_documentadas(RAIZ / 'backend' / '.env.example')
    doc_front = vars_documentadas(RAIZ / 'frontend' / '.env.example')
    for v in sorted(codigo_api - doc_api):
        erros.append(f'variável {v} é usada pela API mas não está em backend/.env.example')
    for v in sorted(codigo_front - doc_front):
        erros.append(f'variável {v} é usada pelo front mas não está em frontend/.env.example')
    for v in sorted(OBRIGATORIAS_API - chaves(api)):
        erros.append(f'agenda-api: variável obrigatória {v} ausente no render.yaml')
    for v in sorted((chaves(api) | chaves(cron)) - codigo_api - DA_PLATAFORMA):
        avisos.append(f'variável {v} está no render.yaml mas o código não a lê')
    for v in sorted({'VITE_API_URL', 'NODE_VERSION'} - chaves(front)):
        erros.append(f'agenda-front: variável {v} ausente no render.yaml')
    for v in sorted({'DJANGO_SECRET_KEY', 'DATABASE_URL', 'CLOUDINARY_URL', 'DJANGO_DEBUG'} - chaves(cron)):
        erros.append(f'agenda-rotina-midia: variável {v} ausente (o cron usa o Django e o Cloudinary)')
    if not erros:
        ok(f'{len(codigo_api)} variáveis da API e {len(codigo_front)} do front documentadas; obrigatórias no render.yaml')

    pendentes = sorted(f'{n}.{ev["key"]}' for n, s in servicos.items() for ev in s.get('envVars', []) if ev.get('sync') is False)
    print('  INFO   preencher no painel do Render na criação: ' + ', '.join(pendentes))
    return relatorio()


def relatorio() -> int:
    for a in avisos:
        print(f'  AVISO  {a}')
    for e in erros:
        print(f'  ERRO   {e}')
    print('render.yaml: ' + ('FALHA' if erros else 'OK'))
    return 1 if erros else 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
