"""
Provedor de armazenamento: disco local (MIDIA_PROVEDOR=local).

Só para desenvolvimento, E2E e simulação de produção na própria máquina: permite testar
upload, leitura, remoção e o comando verificar_uso_midia sem conta no Cloudinary.
Segue o mesmo contrato do Cloudinary: o navegador faz POST multipart em `upload_url`
com os `campos` assinados (HMAC com a SECRET_KEY) e o servidor detecta o formato pelo
conteúdo. Anexos privados só são lidos com URL assinada e com validade.

NUNCA em produção: no Render o disco é apagado a cada deploy. settings.py se recusa a
subir com MIDIA_PROVEDOR=local quando a variável RENDER existe.
"""
import hashlib
import hmac
import mimetypes
import time
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .midia import (
    ENTREGA_PUBLICA, FORMATOS, TIPO_ENTREGA, ArquivoArmazenado, Metadados, UsoArmazenamento,
    limite_bytes,
)

VALIDADE_UPLOAD_SEG = 60 * 60
VALIDADE_URL_SEG = 60 * 60
GB = 1024 ** 3  # Cloudinary: 1 crédito = 1 GB armazenado (aproximação usada no alerta)


def detectar_formato(cabecalho: bytes) -> str | None:
    """Formato pelo conteúdo (magic bytes), nunca pela extensão."""
    if cabecalho.startswith(b'\xff\xd8\xff'):
        return 'jpg'
    if cabecalho.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    if cabecalho[:4] == b'RIFF' and cabecalho[8:12] == b'WEBP':
        return 'webp'
    if cabecalho[4:8] == b'ftyp':
        return 'mp4'
    if cabecalho.startswith(b'\x1a\x45\xdf\xa3'):
        return 'webm'
    return None


def _assinar(*partes: object) -> str:
    msg = '|'.join(str(p) for p in partes).encode()
    return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def _raiz() -> Path:
    return Path(settings.MIDIA_LOCAL_DIR)


def _base_url() -> str:
    return settings.MIDIA_LOCAL_URL_BASE.rstrip('/')


def _caminho(public_id: str, entrega: str) -> Path | None:
    """Arquivo salvo (qualquer extensão) ou None. Recusa caminhos fora da pasta."""
    pasta = (_raiz() / entrega).resolve()
    alvo = (pasta / public_id).resolve()
    if pasta not in alvo.parents:
        return None
    for arq in alvo.parent.glob(alvo.name + '.*') if alvo.parent.is_dir() else []:
        return arq
    return None


class ProvedorLocal:
    nome = 'local'

    def configurado(self) -> bool:
        return True

    def descritor_upload(self, *, public_id: str, tipo: str, entrega: str, timestamp: int) -> dict:
        campos = {
            'public_id': public_id, 'tipo': tipo, 'entrega': entrega, 'timestamp': str(timestamp),
            'allowed_formats': ','.join(sorted(FORMATOS[tipo])),
        }
        campos['signature'] = _assinar(public_id, tipo, entrega, timestamp)
        return {**campos, 'upload_url': f'{_base_url()}/api/v1/midia-local/upload/', 'campos': campos}

    def metadados(self, public_id: str, tipo: str, entrega: str) -> Metadados | None:
        arq = _caminho(public_id, entrega)
        if arq is None:
            return None
        with arq.open('rb') as f:
            formato = detectar_formato(f.read(16)) or ''
        return Metadados(public_id=public_id, tipo=tipo, formato=formato, bytes=arq.stat().st_size,
                         largura=None, altura=None, duracao_seg=None)

    def apagar(self, public_id: str, tipo: str, resource_type: str | None, entrega: str) -> None:
        arq = _caminho(public_id, entrega)
        if arq is not None:
            arq.unlink(missing_ok=True)

    def tornar_publico(self, public_id: str, tipo: str) -> None:
        arq = _caminho(public_id, TIPO_ENTREGA)
        if arq is None:
            return
        destino = _raiz() / ENTREGA_PUBLICA / (public_id + arq.suffix)
        destino.parent.mkdir(parents=True, exist_ok=True)
        arq.replace(destino)

    def urls(self, public_id: str, tipo: str, entrega: str) -> dict:
        url = f'{_base_url()}/api/v1/midia-local/arquivo/{entrega}/{public_id}'
        if entrega == TIPO_ENTREGA:
            exp = int(time.time()) + VALIDADE_URL_SEG
            url += f'?exp={exp}&sig={_assinar(entrega, public_id, exp)}'
        return {'url': url, 'thumb_url': url if tipo == 'imagem' else None}

    def url_imagem(self, public_id: str, largura: int, altura: int | None) -> str:
        return self.urls(public_id, 'imagem', ENTREGA_PUBLICA)['url']  # sem redimensionamento local

    def listar(self, prefixo: str) -> Iterator[ArquivoArmazenado]:
        for entrega in (TIPO_ENTREGA, ENTREGA_PUBLICA):
            pasta = _raiz() / entrega
            if not pasta.is_dir():
                continue
            for arq in pasta.rglob('*.*'):
                public_id = arq.relative_to(pasta).with_suffix('').as_posix()
                if not public_id.startswith(prefixo):
                    continue
                formato = arq.suffix.lstrip('.')
                tipo = next((t for t, fmts in FORMATOS.items() if formato in fmts), 'raw')
                yield ArquivoArmazenado(
                    public_id=public_id, tipo=tipo, resource_type=tipo, entrega=entrega,
                    criado_em=datetime.fromtimestamp(arq.stat().st_mtime, tz=timezone.utc),
                )

    def uso(self) -> UsoArmazenamento:
        total = sum(a.stat().st_size for a in _raiz().rglob('*') if a.is_file()) if _raiz().is_dir() else 0
        return UsoArmazenamento(creditos_usados=total / GB, creditos_limite=25.0,
                                armazenamento_bytes=total, banda_bytes=0)


# ── Endpoints que fazem o papel do Cloudinary ────────────────────────────────

def _erro(msg: str, status: int = 400) -> JsonResponse:
    return JsonResponse({'error': {'message': msg}}, status=status)  # mesmo formato do Cloudinary


@csrf_exempt
@require_POST
def receber_upload(request):
    d = request.POST
    try:
        public_id, tipo, entrega, ts = d['public_id'], d['tipo'], d['entrega'], int(d['timestamp'])
    except (KeyError, ValueError):
        return _erro('Campos de upload ausentes.')
    if tipo not in FORMATOS or entrega not in (TIPO_ENTREGA, ENTREGA_PUBLICA):
        return _erro('Parâmetros inválidos.')
    if not hmac.compare_digest(d.get('signature', ''), _assinar(public_id, tipo, entrega, ts)):
        return _erro('Assinatura inválida.', 401)
    if time.time() - ts > VALIDADE_UPLOAD_SEG:
        return _erro('Assinatura expirada.', 401)
    arquivo = request.FILES.get('file')
    if arquivo is None:
        return _erro('Arquivo ausente.')
    if arquivo.size > limite_bytes(tipo):
        return _erro('Arquivo maior que o permitido.')
    formato = detectar_formato(arquivo.read(16))
    if formato not in FORMATOS[tipo]:
        return _erro('Formato de arquivo não permitido.')
    if _caminho(public_id, entrega) is not None:
        return _erro('Arquivo já existe.', 409)

    destino = (_raiz() / entrega / f'{public_id}.{formato}').resolve()
    if (_raiz() / entrega).resolve() not in destino.parents:
        return _erro('Caminho inválido.')
    destino.parent.mkdir(parents=True, exist_ok=True)
    arquivo.seek(0)
    with destino.open('wb') as f:
        for parte in arquivo.chunks():
            f.write(parte)
    return JsonResponse({'public_id': public_id, 'format': formato, 'bytes': arquivo.size})


@require_GET
def servir_arquivo(request, entrega: str, public_id: str):
    if entrega not in (TIPO_ENTREGA, ENTREGA_PUBLICA):
        raise Http404
    if entrega == TIPO_ENTREGA:
        try:
            exp = int(request.GET.get('exp', '0'))
        except ValueError:
            raise Http404
        if exp < time.time() or not hmac.compare_digest(
            request.GET.get('sig', ''), _assinar(entrega, public_id, exp),
        ):
            raise Http404
    arq = _caminho(public_id, entrega)
    if arq is None:
        raise Http404
    tipo_mime = mimetypes.guess_type(arq.name)[0] or 'application/octet-stream'
    resp = FileResponse(arq.open('rb'), content_type=tipo_mime)
    resp['Cross-Origin-Resource-Policy'] = 'cross-origin'  # o front roda em outra origem
    return resp
