from django.contrib.auth.hashers import Argon2PasswordHasher


class Argon2OwaspPasswordHasher(Argon2PasswordHasher):
    """
    Argon2id com os parâmetros mínimos recomendados pela OWASP
    (m=19 MiB, t=2, p=1). O padrão do Django (100 MiB, p=8) e o PBKDF2 com
    1,2 M iterações custam ~0,5 s de CPU por login — numa instância de 0,1 CPU
    isso trava o servidor por vários segundos a cada login. Senhas antigas
    (PBKDF2) continuam válidas e são migradas automaticamente no próximo login.
    """
    time_cost = 2
    memory_cost = 19 * 1024  # KiB
    parallelism = 1
