"""Validação de links do YouTube. Guardamos só o ID do vídeo, nunca a URL informada."""
import re
from urllib.parse import parse_qs, urlparse

_ID = re.compile(r'[A-Za-z0-9_-]{11}')
_HOSTS_LONGOS = {'youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'}
_PREFIXOS_CAMINHO = ('/shorts/', '/embed/', '/live/', '/v/')


def extrair_youtube_id(url: str) -> str | None:
    """
    Aceita youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ e
    youtube-nocookie.com/embed/. Retorna o ID de 11 caracteres ou None.
    """
    url = (url or '').strip()
    if not url or len(url) > 500:
        return None
    if '://' not in url:
        url = 'https://' + url
    try:
        p = urlparse(url)
    except ValueError:
        return None
    if p.scheme not in ('http', 'https'):
        return None
    host = (p.hostname or '').lower()
    if host.startswith('www.'):
        host = host[4:]

    candidato = None
    if host == 'youtu.be':
        candidato = p.path.lstrip('/').split('/')[0]
    elif host in _HOSTS_LONGOS:
        if p.path == '/watch':
            candidato = (parse_qs(p.query).get('v') or [''])[0]
        else:
            for prefixo in _PREFIXOS_CAMINHO:
                if p.path.startswith(prefixo):
                    candidato = p.path[len(prefixo):].split('/')[0]
                    break
    if candidato and _ID.fullmatch(candidato):
        return candidato
    return None


def url_embed(video_id: str) -> str:
    """Player sem cookies de rastreamento até a reprodução."""
    return f'https://www.youtube-nocookie.com/embed/{video_id}'


def url_miniatura(video_id: str) -> str:
    return f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg'
