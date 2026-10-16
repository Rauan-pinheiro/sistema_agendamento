from django.apps import AppConfig


class AgendamentosConfig(AppConfig):
    name = 'agendamentos'

    def ready(self):
        from . import signals  # noqa: F401  (registra os receivers)
