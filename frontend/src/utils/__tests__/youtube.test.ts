import { describe, expect, it } from 'vitest';
import { extrairYoutubeId } from '../youtube';

const ID = 'dQw4w9WgXcQ';

describe('extrairYoutubeId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `http://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `  youtube.com/watch?v=${ID}  `,
    `www.youtu.be/${ID}`,
  ])('aceita %s', (url) => expect(extrairYoutubeId(url)).toBe(ID));

  it.each([
    '', 'abc', `https://vimeo.com/${ID}`, `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`, `https://notyoutube.com/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=curto', 'https://youtu.be/', 'https://www.youtube.com/',
    `https://www.youtube.com/watch?v=${ID}"><script>`, `javascript:alert(1)//youtu.be/${ID}`,
    `https://www.youtube.com/channel/${ID}`, `ftp://youtu.be/${ID}`,
    'https://www.youtube.com/watch?v=' + 'a'.repeat(200),
  ])('rejeita %s', (url) => expect(extrairYoutubeId(url)).toBeNull());
});
