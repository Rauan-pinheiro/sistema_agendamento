"""
Mídia (fotos e vídeos): regras do produto + interface única de armazenamento.

Este módulo não conhece o provedor. Views, serializers, signals e comandos usam só
as funções daqui (assinar upload, ler metadados, URL, tornar público, apagar, listar,
uso). O provedor concreto fica atrás de `ProvedorMidia` e é escolhido por
settings.MIDIA_PROVEDOR — hoje 'cloudinary' (midia_cloudinary.py). Migrar para o
Cloudflare R2 = escrever outro provedor com os mesmos métodos, sem tocar no resto.

Fluxo de upload (o arquivo nunca passa pelo servidor do Render):
  1. O dono pede uma assinatura → `gerar_assinatura_upload()`.
     O servidor escolhe a pasta e o public_id (aleatório) e restringe os formatos
     aceitos. Como esses parâmetros entram na assinatura, o navegador não consegue
     enviar para outra pasta nem trocar os formatos.
  2. O navegador faz POST multipart em `upload_url` com `campos` + o arquivo.
  3. O dono confirma → `obter_metadados()` devolve o formato *detectado pelo
     provedor a partir do conteúdo* (não da extensão) e o tamanho real. Se algo
     não bater, o arquivo é apagado.

Privacidade: anexos de agendamento são privados (só URLs assinadas, entregues
apenas ao dono). Mídias de serviço são vitrine pública, mas também chegam privadas
e só são promovidas a públicas depois de validadas.
"""
import logging
import re
import secrets
import time
import unicodedata
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from typing import Protocol

from django.conf import settings

log = logging.getLogger(__name__)

TIPO_ENTREGA = 'authenticated'   # anexos privados de agendamento
ENTREGA_PUBLICA = 'upload'       # vitrine pública dos serviços

FORMATOS = {
    'imagem': {'jpg', 'png', 'webp'},
    'video': {'mp4', 'webm'},
}
MIME_PARA_TIPO = {
    'image/jpeg': 'imagem', 'image/png': 'imagem', 'image/webp': 'imagem',
    'video/mp4': 'video', 'video/webm': 'video',
}
EXTENSOES = {
    'jpg': 'imagem', 'jpeg': 'imagem', 'png': 'imagem', 'webp': 'imagem',
    'mp4': 'video', 'webm': 'video',
}


class MidiaIndisponivel(Exception):
    """Armazenamento não configurado ou fora do ar."""


@dataclass
class Metadados:
    public_id: str
    tipo: str
    formato: str
    bytes: int
    largura: int | None
    altura: int | None
    duracao_seg: float | None


@dataclass
class ArquivoArmazenado:
    public_id: str
    tipo: str            # 'imagem', 'video' ou 'raw' (formato inesperado)
    resource_type: str
    entrega: str
    criado_em: datetime


@dataclass
class UsoArmazenamento:
    creditos_usados: float
    creditos_limite: float | None
    armazenamento_bytes: int
    banda_bytes: int


class ProvedorMidia(Protocol):
    """Interface que todo provedor de armazenamento implementa."""
    nome: str

    def configurado(self) -> bool: ...
    def descritor_upload(self, *, public_id: str, tipo: str, entrega: str, timestamp: int) -> dict: ...
    def metadados(self, public_id: str, tipo: str, entrega: str) -> Metadados | None: ...
    def apagar(self, public_id: str, tipo: str, resource_type: str | None, entrega: str) -> None: ...
    def tornar_publico(self, public_id: str, tipo: str) -> None: ...
    def urls(self, public_id: str, tipo: str, entrega: str) -> dict: ...
    def listar(self, prefixo: str) -> Iterator[ArquivoArmazenado]: ...
    def uso(self) -> UsoArmazenamento: ...


@lru_cache(maxsize=1)
def provedor() -> ProvedorMidia:
    nome = getattr(settings, 'MIDIA_PROVEDOR', 'cloudinary')
    if nome == 'cloudinary':
        from .midia_cloudinary import ProvedorCloudinary
        return ProvedorCloudinary()
    if nome == 'local':  # só desenvolvimento e simulação local (ver midia_local.py)
        from .midia_local import ProvedorLocal
        return ProvedorLocal()
    raise MidiaIndisponivel(f'Provedor de mídia desconhecido: {nome}')


def configurado() -> bool:
    return provedor().configurado()


def _exigir_configuracao():
    if not configurado():
        raise MidiaIndisponivel('Armazenamento de mídia não configurado.')


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


def pasta_do_servico(empresa_id: int, servico_id: int) -> str:
    return f'{settings.MIDIA_PASTA_RAIZ}/e{empresa_id}/sv{servico_id}'


_TOKEN_LEN = 12  # bytes → 16 caracteres em token_urlsafe


def public_id_valido(public_id: str, pasta: str) -> bool:
    """Aceita exatamente o formato gerado por gerar_assinatura_upload() para esta pasta."""
    return re.fullmatch(re.escape(pasta) + r'/[A-Za-z0-9_-]{16}', public_id or '') is not None


def gerar_assinatura_upload(*, pasta: str, tipo: str, entrega: str = TIPO_ENTREGA) -> dict:
    """Descritor do upload direto do navegador (upload_url + campos assinados + limites)."""
    _exigir_configuracao()
    public_id = f'{pasta}/{secrets.token_urlsafe(_TOKEN_LEN)}'
    descritor = provedor().descritor_upload(
        public_id=public_id, tipo=tipo, entrega=entrega, timestamp=int(time.time()),
    )
    return {**descritor, 'public_id': public_id, 'max_bytes': limite_bytes(tipo)}


def obter_metadados(public_id: str, tipo: str, entrega: str = TIPO_ENTREGA) -> Metadados | None:
    """Metadados autoritativos do provedor; None se o arquivo não existir."""
    _exigir_configuracao()
    return provedor().metadados(public_id, tipo, entrega)


def apagar(public_id: str, tipo: str, resource_type: str | None = None,
           entrega: str = TIPO_ENTREGA) -> None:
    """Apaga o arquivo no provedor. Falhas são registradas, não propagadas."""
    if not configurado():
        return
    try:
        provedor().apagar(public_id, tipo, resource_type, entrega)
    except Exception:  # noqa: BLE001 — limpeza best-effort
        log.exception('Falha ao apagar mídia %s', public_id)


def promover_para_publico(public_id: str, tipo: str) -> None:
    """
    Torna público um arquivo já validado. Uploads da vitrine chegam privados e só
    viram públicos depois da confirmação — assim uma assinatura nunca serve para
    hospedar arquivos arbitrários publicamente. Levanta MidiaIndisponivel em caso de falha.
    """
    _exigir_configuracao()
    provedor().tornar_publico(public_id, tipo)


def validar_metadados(meta: Metadados, tipo: str) -> str | None:
    """Confere o formato detectado pelo provedor e o tamanho real. Retorna o erro ou None."""
    if meta.formato not in FORMATOS[tipo]:
        return 'Tipo de arquivo não permitido. Envie JPG, PNG, WEBP, MP4 ou WEBM.'
    if meta.bytes > limite_bytes(tipo):
        return 'Arquivo maior que o limite permitido.'
    return None


def urls_assinadas(public_id: str, tipo: str, entrega: str = TIPO_ENTREGA) -> dict:
    """URLs de exibição (original otimizado) e miniatura. Assinadas quando privadas."""
    if not configurado():
        return {'url': None, 'thumb_url': None}
    return provedor().urls(public_id, tipo, entrega)


def listar_arquivos(prefixo: str | None = None) -> Iterator[ArquivoArmazenado]:
    """Todos os arquivos sob o prefixo (padrão: a pasta raiz do sistema)."""
    _exigir_configuracao()
    return provedor().listar(prefixo or settings.MIDIA_PASTA_RAIZ + '/')


def uso_atual() -> UsoArmazenamento:
    _exigir_configuracao()
    return provedor().uso()
