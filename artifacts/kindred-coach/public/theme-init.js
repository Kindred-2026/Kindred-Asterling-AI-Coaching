// Applies the saved theme before React renders, so the page never flashes the
// wrong colours. Kept in its own file because the Content Security Policy
// blocks inline scripts. The storage key matches src/hooks/use-theme.tsx.
(function () {
  try {
    var t = localStorage.getItem('kindred-theme');
    if (t !== 'midnight' && t !== 'forest') t = 'midnight';
    document.documentElement.classList.add('theme-' + t);
  } catch (e) {
    document.documentElement.classList.add('theme-midnight');
  }
})();
