// Quiet supporting motion; the automobile remains the only focal sequence.
export function createEditorialMotion(preference, invalidate) {
  const visiblePhotos = new Set(), animations = new Set();
  const photos = [...document.querySelectorAll('.values-photo,.portfolio-item,.visual')];
  photos.forEach(node => node.classList.add('editorial-photo'));
  const photoObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visiblePhotos.add(entry.target);
      else visiblePhotos.delete(entry.target);
    });
    invalidate();
  });
  photos.forEach(node => photoObserver.observe(node));
  const targets = document.querySelectorAll('.intro>.reveal,.section-title,.values-copy,.booking-copy,.form');
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      revealObserver.unobserve(entry.target);
      if (preference.matches) return;
      const animation = entry.target.animate([
        {opacity:.4,transform:'translateY(18px)'},
        {opacity:1,transform:'translateY(0)'}
      ], {duration:650,easing:'cubic-bezier(.16,1,.3,1)'});
      animations.add(animation);
      animation.finished.finally(() => animations.delete(animation)).catch(() => {});
    });
  }, {threshold:.14});
  targets.forEach(node => revealObserver.observe(node));
  const onPreference = () => {
    if (preference.matches) animations.forEach(animation => animation.cancel());
    invalidate();
  };
  preference.addEventListener('change',onPreference);
  return {
    update() {
      for (const node of visiblePhotos) {
        const box = node.getBoundingClientRect();
        const offset = preference.matches ? 0 : Math.max(-16,Math.min(16,(innerHeight/2-box.top-box.height/2)*.035));
        node.style.setProperty('--photo-shift',offset.toFixed(2)+'px');
      }
    },
    dispose() {
      photoObserver.disconnect();revealObserver.disconnect();
      preference.removeEventListener('change',onPreference);
      animations.forEach(animation => animation.cancel());
    }
  };
}
