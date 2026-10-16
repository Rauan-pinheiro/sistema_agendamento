"""
Integração com o Cloudinary para anexos de mídia (fotos e vídeos).

Fluxo de upload (o arquivo nunca passa pelo servidor do Render):
  1. O dono pede uma assinatura → `gerar_assinatura_upload()`.
     O servidor escolhe a pasta e o public_id (aleatório) e restringe os formatos
     aceitos (`allowed_formats`). Como esses parâmetros entram na assinatura,
     o navegador não consegue enviar para outra pasta nem trocar os formatos.
  2. O navegador envia o arquivo direto ao Cloudinary (com barra de progresso).
  3. O dono confirma → `obter_metadados()` consulta a Admin API e devolve o
     formato *detectado pelo Cloudinary a partir do conteúdo* (não da extensão)
     e o tamanho real. Se algo não bater, o arquivo é apagado.

Privacidade: os arquivos usam o tipo de entrega `authenticated` — só podem ser
vistos por URLs assinadas, que a API entrega apenas ao dono da empresa.
"""
import logging
import re
import secrets
import time
import unicodedata
from dataclasses import dataclass

import cloudinary
import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
import cloudinary.utils
from django.conf import settings

log = logging.getLogger(__name__)

TIPO_ENTREGA = 'authenticated'

FORMATOS = {
    'imagem': {'jpg', 'png', 'webp'},
    'video': {'mp4', 'webm'},
}
# Cloudinary chama de "image"/"video" o resource_type
RESOURCE_TYPE = {'imagem': 'image', 'video': 'video'}
MIME_PARA_TIPO = {
    'image/jpeg': 'imagem', 'image/png': 'imagem', 'image/webp': 'imagem',
    'video/mp4': 'video', 'video/webm': 'video',
}
EXTENSOES = {
    'jpg': 'imagem', 'jpeg': 'imagem', 'png': 'imagem', 'webp': 'imagem',
    'mp4': 'video', 'webm': 'video',
}


class MidiaIndisponivel(Exception):
    """Cloudinary não configurado ou fora do ar."""


def configurado() -> bool:
    cfg = cloudinary.config()
    return bool(cfg.cloud_name and cfg.api_key and cfg.api_secret)


def _exigir_configuracao():
    if not configurado():
        raise MidiaIndisponivel('Armazenamento de mídia não configurado (CLOUDINARY_URL).')


def limite_bytes(tipo: str) -> int:
    return settings.MIDIA_MAX_BYTES_IMAGEM if tipo == 'imagem' else settings.MIDIA_MAX_BYTES_VIDEO


def sanitizar_nome(nome: str, max_len: int = 100) -> str:
    """
    Nome de exibição seguro: remove caminho, acentos problemáticos, caracteres de
    controle e qualquer coisa fora de [A-Za-z0-9 ._-]. O nome NUNCA é usado como
    caminho no storage (o public_id é aleatório) — serve só para exibição.
    """
    nome = (nome or '').replace('\\', '/').split('/')[-1]
    nome = unicodedata.normalize('NFKD', nome).encode('ascii', 'ignore').decode('ascii')
    nome = re.sub(r'[^A-Za-z0-9 ._-]', '_', nome).strip(' ._')
    nome = re.sub(r'_{2,}', '_', nome)
    if not nome:
        nome = 'arquivo'
    if len(nome) > max_len:
        base, _, ext = nome.rpartition('.')
        nome = (base[:max_len - len(ext) - 1] + '.' + ext) if base and len(ext) <= 5 else nome[:max_len]
    return nome


def tipo_por_extensao(nome: str) -> str | None:
    ext = nome.rsplit('.', 1)[-1].lower() if '.' in nome else ''
    return EXTENSOES.get(ext)


def pasta_do_agendamento(empresa_id: int, agendamento_id: int) -> str:
    return f'{settings.MIDIA_PASTA_RAIZ}/e{empresa_id}/ag{agendamento_id}'


def gerar_assinatura_upload(*, pasta: str, tipo: str) -> dict:
    """Parâmetros assinados para o upload direto do navegador."""
    _exigir_configuracao()
    cfg = cloudinary.config()
    public_id = f'{pasta}/{secrets.token_urlsafe(12)}'
    params = {
        'timestamp': int(time.time()),
        'public_id': public_id,
        'type': TIPO_ENTREGA,
        'allowed_formats': ','.join(sorted(FORMATOS[tipo])),
        'overwrite': 'false',
    }
    params['signature'] = cloudinary.utils.api_sign_request(params, cfg.api_secret)
    resource_type = RESOURCE_TYPE[tipo]
    return {
        **params,
        'api_key': cfg.api_key,
        'cloud_name': cfg.cloud_name,
        'resource_type': resource_type,
        'upload_url': f'https://api.cloudinary.com/v1_1/{cfg.cloud_name}/{resource_type}/upload',
        'max_bytes': limite_bytes(tipo),
    }


@dataclass
class Metadados:
    public_id: str
    tipo: str
    formato: str
    bytes: int
    largura: int | None
    altura: int | None
    duracao_seg: float | None


def obter_metadados(public_id: str, tipo: str) -> Metadados | None:
    """Metadados autoritativos do Cloudinary; None se o arquivo não existir."""
    _exigir_configuracao()
    try:
        r = cloudinary.api.resource(public_id, resource_type=RESOURCE_TYPE[tipo], type=TIPO_ENTREGA)
    except cloudinary.exceptions.NotFound:
        return None
    except cloudinary.exceptions.Error as exc:
        raise MidiaIndisponivel(str(exc)) from exc
    return Metadados(
        public_id=r['public_id'],
        tipo=tipo,
        formato=(r.get('format') or '').lower(),
        bytes=int(r.get('bytes') or 0),
        largura=r.get('width'),
        altura=r.get('height'),
        duracao_seg=r.get('duration'),
    )


def apagar(public_id: str, tipo: str) -> None:
    """Apaga o arquivo no Cloudinary. Falhas são registradas, não propagadas."""
    if not configurado():
        return
    try:
        cloudinary.uploader.destroy(
            public_id, resource_type=RESOURCE_TYPE[tipo], type=TIPO_ENTREGA, invalidate=True,
        )
    except Exception:  # noqa: BLE001 — limpeza best-effort
        log.exception('Falha ao apagar mídia %s no Cloudinary', public_id)


def urls_assinadas(public_id: str, tipo: str) -> dict:
    """URLs de exibição (original otimizado) e miniatura, assinadas."""
    if not configurado():
        return {'url': None, 'thumb_url': None}
    comum = {'type': TIPO_ENTREGA, 'sign_url': True, 'secure': True}
    if tipo == 'imagem':
        url, _ = cloudinary.utils.cloudinary_url(
            public_id, resource_type='image', **comum,
            transformation=[{'width': 1600, 'height': 1600, 'crop': 'limit',
                             'quality': 'auto', 'fetch_format': 'auto'}],
        )
        thumb, _ = cloudinary.utils.cloudinary_url(
            public_id, resource_type='image', **comum,
            transformation=[{'width': 320, 'height': 320, 'crop': 'fill', 'gravity': 'auto',
                             'quality': 'auto', 'fetch_format': 'auto'}],
        )
    else:
        url, _ = cloudinary.utils.cloudinary_url(
            public_id, resource_type='video', **comum,
            transformation=[{'quality': 'auto'}],
        )
        # Poster do vídeo: quadro inicial em JPG
        thumb, _ = cloudinary.utils.cloudinary_url(
            public_id, resource_type='video', format='jpg', **comum,
            transformation=[{'start_offset': 0, 'width': 320, 'height': 320, 'crop': 'fill',
                             'quality': 'auto'}],
        )
    return {'url': url, 'thumb_url': thumb}
