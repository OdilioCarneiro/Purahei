(() => {
  const k = 0.45; // graus por pixel
  const rot = () =>
    document.querySelectorAll('.vinyl').forEach(el => {
      const dir = Number(el.dataset.spin || 1);
      el.style.transform = `rotate(${window.scrollY * k * dir}deg)`;
    });

  rot();                  // aplica ao carregar
  addEventListener('scroll', rot, { passive: true });
})();
