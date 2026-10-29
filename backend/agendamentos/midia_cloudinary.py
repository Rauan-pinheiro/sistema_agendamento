"""
Provedor de armazenamento: Cloudinary.

Único arquivo do back-end que importa o SDK do Cloudinary. Para migrar (ex.: Cloudflare R2),
crie outro provedor com os mesmos métodos de `midia.ProvedorMidia` e troque MIDIA_PROVEDOR.
"""
import logging
from collections.abc import Iterator
from datetime import datetime

import cloudinary
import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
import cloudinary.utils

from .midia import (
    ENTREGA_PUBLICA, FORMATOS, TIPO_ENTREGA, ArquivoArmazenado, Metadados, MidiaIndisponivel,
    UsoArmazenamento,
)

log = logging.getLogger(__name__)

# Cloudinary chama de "image"/"video" o resource_type
RESOURCE_TYPE = {'imagem': 'image', 'video': 'video'}


class ProvedorCloudinary:
    nome = 'cloudinary'

    def configurado(self) -> bool:
        cfg = cloudinary.config()
        return bool(cfg.cloud_name and cfg.api_key and cfg.api_secret)

    def descritor_upload(self, *, public_id: str, tipo: str, entrega: str, timestamp: int) -> dict:
        cfg = cloudinary.config()
        params = {
            'timestamp': timestamp,
            'public_id': public_id,
            'type': entrega,
            'allowed_formats': ','.join(sorted(FORMATOS[tipo])),
            'overwrite': 'false',
        }
        params['signature'] = cloudinary.utils.api_sign_request(params, cfg.api_secret)
        resource_type = RESOURCE_TYPE[tipo]
        campos = {**params, 'api_key': cfg.api_key}
        return {
            **campos,
            'cloud_name': cfg.cloud_name,
            'resource_type': resource_type,
            'upload_url': f'https://api.cloudinary.com/v1_1/{cfg.cloud_name}/{resource_type}/upload',
            # Contrato genérico: o navegador faz POST multipart em upload_url com `campos` + `file`
            'campos': {k: str(v) for k, v in campos.items()},
        }

    def metadados(self, public_id: str, tipo: str, entrega: str) -> Metadados | None:
        try:
            r = cloudinary.api.resource(public_id, resource_type=RESOURCE_TYPE[tipo], type=entrega)
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

    def apagar(self, public_id: str, tipo: str, resource_type: str | None, entrega: str) -> None:
        cloudinary.uploader.destroy(
            public_id, resource_type=resource_type or RESOURCE_TYPE[tipo],
            type=entrega, invalidate=True,
        )

    def tornar_publico(self, public_id: str, tipo: str) -> None:
        try:
            cloudinary.uploader.rename(
                public_id, public_id, resource_type=RESOURCE_TYPE[tipo],
                type=TIPO_ENTREGA, to_type=ENTREGA_PUBLICA, invalidate=True,
            )
        except cloudinary.exceptions.Error as exc:
            raise MidiaIndisponivel(str(exc)) from exc

    def urls(self, public_id: str, tipo: str, entrega: str) -> dict:
        comum = {'type': entrega, 'sign_url': entrega == TIPO_ENTREGA, 'secure': True}
        if tipo == 'imagem':
            url, _ = cloudinary.utils.cloudinary_url(
                public_id, resource_type='image', **comum,
                transformation=[{'width': 1600, 'height': 1600, 'crop': 'limit',
                                 'quality': 'auto', 'fetch_format': 'auto'}],
            )
            thumb, _ = cloudinary.utils.cloudinary_url(
                public_id, resource_type='image', **comum,
                transformation=[{'width': 480, 'height': 480, 'crop': 'fill', 'gravity': 'auto',
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

    def url_imagem(self, public_id: str, largura: int, altura: int | None) -> str:
        t = {'width': largura, 'crop': 'limit', 'quality': 'auto', 'fetch_format': 'auto'}
        if altura:
            t.update(height=altura, crop='fill', gravity='auto')
        url, _ = cloudinary.utils.cloudinary_url(
            public_id, resource_type='image', type=ENTREGA_PUBLICA, secure=True, transformation=[t],
        )
        return url

    def listar(self, prefixo: str) -> Iterator[ArquivoArmazenado]:
        # 'raw' cobre uploads feitos para o endpoint errado com uma assinatura válida
        varreduras = [
            (tipo, rt, entrega)
            for tipo, rt in [*RESOURCE_TYPE.items(), ('raw', 'raw')]
            for entrega in (TIPO_ENTREGA, ENTREGA_PUBLICA)
        ]
        for tipo, resource_type, entrega in varreduras:
            cursor = None
            while True:
                pagina = cloudinary.api.resources(
                    type=entrega, resource_type=resource_type,
                    prefix=prefixo, max_results=500, next_cursor=cursor,
                )
                for r in pagina.get('resources', []):
                    yield ArquivoArmazenado(
                        public_id=r['public_id'], tipo=tipo, resource_type=resource_type,
                        entrega=entrega,
                        criado_em=datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')),
                    )
                cursor = pagina.get('next_cursor')
                if not cursor:
                    break

    def uso(self) -> UsoArmazenamento:
        try:
            r = cloudinary.api.usage()
        except cloudinary.exceptions.Error as exc:
            raise MidiaIndisponivel(str(exc)) from exc
        creditos = r.get('credits') or {}
        return UsoArmazenamento(
            creditos_usados=float(creditos.get('usage') or 0),
            creditos_limite=float(creditos.get('limit') or 0) or None,
            armazenamento_bytes=int((r.get('storage') or {}).get('usage') or 0),
            banda_bytes=int((r.get('bandwidth') or {}).get('usage') or 0),
        )
