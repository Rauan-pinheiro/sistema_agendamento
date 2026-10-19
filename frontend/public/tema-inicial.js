// Tema manual salvo pelo painel ("light" | "dark"); sem escolha, segue o sistema.
try {
  var t = localStorage.getItem('tema');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* armazenamento indisponível: segue o sistema */ }
