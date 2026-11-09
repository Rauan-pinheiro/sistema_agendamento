// Tema manual salvo pelo painel ("light" | "dark"); sem escolha, segue o sistema.
try {
  var t = localStorage.getItem('tema');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* armazenamento indisponível: segue o sistema */ }
// Paleta 60-30-10 do painel antes da primeira pintura (evita piscar as cores da página pública).
// O React mantém a classe certa depois (hooks/useTemaPainel.ts).
if (/^\/(dashboard|login|register)(\/|$)/.test(location.pathname)) {
  document.documentElement.classList.add('tema-painel');
}
