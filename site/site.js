// Scroll-reveal + image lightbox for the marketing site. Reduced-motion safe.
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Scroll reveal ---
  const items = Array.from(document.querySelectorAll('.reveal'));
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
  } else {
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
  }

  // --- Image lightbox ---
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const closeBtn = document.getElementById('lightbox-close');
  if (!lightbox || !lightboxImg) return;

  let lastFocus = null;

  function open(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lastFocus = document.activeElement;
    closeBtn && closeBtn.focus();
  }
  function close() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.querySelectorAll('img.zoomable').forEach((img) => {
    img.style.cursor = 'zoom-in';
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.addEventListener('click', () => open(img.currentSrc || img.src, img.alt));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(img.currentSrc || img.src, img.alt);
      }
    });
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target === lightboxImg) close();
  });
  closeBtn && closeBtn.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) close();
  });
})();
