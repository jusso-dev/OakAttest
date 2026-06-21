// Scroll-reveal for marketing sections. Respects reduced-motion: if the user
// prefers reduced motion, everything is shown immediately (CSS also no-ops the
// transition).
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = Array.from(document.querySelectorAll('.reveal'));

  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
  );

  items.forEach((el) => io.observe(el));
})();
