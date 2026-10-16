from django.test import SimpleTestCase

from agendamentos.youtube import extrair_youtube_id

ID = 'dQw4w9WgXcQ'


class ExtrairYoutubeIdTests(SimpleTestCase):
    def test_formatos_aceitos(self):
        for url in [
            f'https://www.youtube.com/watch?v={ID}',
            f'https://youtube.com/watch?v={ID}&t=42s&list=PL123',
            f'http://m.youtube.com/watch?feature=share&v={ID}',
            f'https://youtu.be/{ID}',
            f'https://youtu.be/{ID}?si=abc123',
            f'https://www.youtube.com/shorts/{ID}',
            f'https://www.youtube.com/embed/{ID}',
            f'https://www.youtube-nocookie.com/embed/{ID}',
            f'https://www.youtube.com/live/{ID}?feature=share',
            f'  youtube.com/watch?v={ID}  ',
            f'www.youtu.be/{ID}',
        ]:
            self.assertEqual(extrair_youtube_id(url), ID, url)

    def test_formatos_rejeitados(self):
        for url in [
            '', 'abc', f'https://vimeo.com/{ID}', f'https://evil.com/watch?v={ID}',
            f'https://youtube.com.evil.com/watch?v={ID}', f'https://notyoutube.com/watch?v={ID}',
            'https://www.youtube.com/watch?v=curto', 'https://youtu.be/', 'https://www.youtube.com/',
            f'https://www.youtube.com/watch?v={ID}"><script>', f'javascript:alert(1)//youtu.be/{ID}',
            f'https://www.youtube.com/channel/{ID}', f'ftp://youtu.be/{ID}',
            'https://www.youtube.com/watch?v=' + 'a' * 200,
        ]:
            self.assertIsNone(extrair_youtube_id(url), url)
