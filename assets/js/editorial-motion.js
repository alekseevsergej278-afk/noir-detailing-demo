// Quiet supporting motion; the automobile remains the only focal sequence.
export function createEditorialMotion(preference, invalidate) {
  const visiblePhotos = new Set();
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
  const onPreference = () => {
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
      photoObserver.disconnect();
      preference.removeEventListener('change',onPreference);
    }
  };
}
