"""
Logs estruturados: uma linha JSON por evento, com o X-Request-ID da requisição.
Sem dependências do Django/DRF porque o LOGGING é configurado antes dos apps.
"""
import contextvars
import json
import logging

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar('request_id', default='-')


class FiltroRequestId(logging.Filter):
    def filter(self, record):
        if not hasattr(record, 'request_id'):
            record.request_id = _request_id.get()
        return True


class FormatadorJson(logging.Formatter):
    CAMPOS_EXTRAS = ('request_id', 'metodo', 'caminho', 'status', 'duracao_ms', 'ip', 'usuario_id')

    def format(self, record):
        dados = {
            'ts': self.formatTime(record, '%Y-%m-%dT%H:%M:%S%z'),
            'nivel': record.levelname,
            'logger': record.name,
            'msg': record.getMessage(),
        }
        for campo in self.CAMPOS_EXTRAS:
            valor = getattr(record, campo, None)
            if valor is not None:
                dados[campo] = valor
        if record.exc_info:
            dados['exc'] = self.formatException(record.exc_info)
        return json.dumps(dados, ensure_ascii=False, default=str)
