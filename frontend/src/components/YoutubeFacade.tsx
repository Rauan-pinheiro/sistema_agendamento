import { useState } from 'react';
import { Play } from 'lucide-react';

/**
 * "Fachada" do YouTube: mostra só a miniatura (uma imagem leve) e carrega o
 * player do youtube-nocookie apenas quando a pessoa clica. Evita ~1 MB de JS
 * e cookies de terceiros no carregamento da página.
 */
export function YoutubeFacade({ videoId, titulo }: { videoId: string; titulo: string }) {
  const [ativo, setAtivo] = useState(false);

  if (ativo) {
    return (
      <div className="yt-facade">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={titulo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <button type="button" className="yt-facade" onClick={() => setAtivo(true)} aria-label={`Reproduzir vídeo: ${titulo}`}>
      <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
      <span className="yt-facade-play" aria-hidden><Play size={26} fill="currentColor" /></span>
    </button>
  );
}
