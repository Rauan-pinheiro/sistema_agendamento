"""
Gera simulacao/Caddyfile a partir do render.yaml: a "borda" da simulação serve o
Static Site com EXATAMENTE os headers, a CSP e o rewrite declarados no render.yaml, e faz
proxy HTTPS → API como o Render (repassando X-Forwarded-For e X-Forwarded-Proto).

Única troca na CSP: o domínio da API de produção (agenda-api.onrender.com) vira o da
simulação (https://localhost:8443). Com MIDIA_PROVEDOR=local, a API também entra em
img-src/media-src, porque as mídias saem dela e não do res.cloudinary.com.
"""
import os
import sys
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
API_PRODUCAO = 'https://agenda-api.onrender.com'
API_SIM = 'https://localhost:8443'


def csp_simulacao(csp: str, midia_local: bool) -> str:
    csp = csp.replace(API_PRODUCAO, API_SIM)
    if midia_local:
        diretivas = []
        for d in csp.split(';'):
            d = d.strip()
            if d.split(' ')[0] in ('img-src', 'media-src'):
                d += f' {API_SIM}'
            diretivas.append(d)
        csp = '; '.join(diretivas)
    return csp


def main() -> None:
    doc = yaml.safe_load((RAIZ / 'render.yaml').read_text(encoding='utf-8'))
    front = next(s for s in doc['services'] if s['name'] == 'agenda-front')
    midia_local = os.environ.get('MIDIA_PROVEDOR', 'local') == 'local'

    por_caminho: dict[str, list[tuple[str, str]]] = {}
    for h in front['headers']:
        valor = h['value']
        if h['name'] == 'Content-Security-Policy':
            valor = csp_simulacao(valor, midia_local)
        por_caminho.setdefault(h['path'], []).append((h['name'], valor))

    linhas = [
        '# GERADO por gerar_caddyfile.py a partir do render.yaml. Não edite.',
        '{', '\tlocal_certs', '\tskip_install_trust', '\tauto_https disable_redirects', '}', '',
        '# API: TLS na borda e proxy para o gunicorn (como o Render)',
        'https://localhost:8443, https://borda:8443 {',
        '\ttls internal',
        '\treverse_proxy api:8000',
        '}', '',
        '# Static Site (agenda-front)',
        'https://localhost:9443, https://borda:9443 {',
        '\ttls internal',
        '\troot * /srv',
    ]
    for i, (caminho, headers) in enumerate(por_caminho.items()):
        matcher = f'@h{i}'
        linhas.append(f'\t{matcher} path {caminho}')
        linhas.append(f'\theader {matcher} {{')
        for nome, valor in headers:
            linhas.append(f'\t\t{nome} "{valor}"')
        linhas.append('\t}')
    for rota in front.get('routes', []):
        if rota['type'] == 'rewrite' and rota['source'] == '/*':
            # Render: arquivos existentes têm prioridade; o resto cai no destino
            linhas.append(f'\ttry_files {{path}} {rota["destination"]}')
    linhas += ['\tfile_server', '}', '']

    destino = Path(__file__).with_name('Caddyfile')
    destino.write_text('\n'.join(linhas), encoding='utf-8')
    print(f'Caddyfile gerado ({len(front["headers"])} headers do render.yaml, mídia local: {midia_local})')


if __name__ == '__main__':
    sys.exit(main())
