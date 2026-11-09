"""
A suíte testa o provedor Cloudinary (com o SDK mockado) por padrão, independentemente do
ambiente: sem CLOUDINARY_URL, o settings escolheria 'local' em desenvolvimento. As classes
que testam o disco local fazem override_settings(MIDIA_PROVEDOR='local') por conta própria.
"""
from django.conf import settings

settings.MIDIA_PROVEDOR = 'cloudinary'
