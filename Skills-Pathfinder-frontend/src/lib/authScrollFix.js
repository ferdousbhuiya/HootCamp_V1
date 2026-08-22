const AUTH_SWITCH_LABELS = new Set([
  'create account',
  'create an account',
  'sign in',
]);

const normalize = (value = '') => String(value).trim().toLowerCase();

export const installAuthScrollFix = () => {
  if (typeof document === 'undefined' || window.__skillsPathfinderAuthScrollFix) return;
  window.__skillsPathfinderAuthScrollFix = true;

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !AUTH_SWITCH_LABELS.has(normalize(button.textContent))) return;

    // React changes the auth mode after the click. Wait for that render, then bring
    // the active form into view so users never have to discover it by scrolling.
    window.setTimeout(() => {
      const form = document.querySelector('main form');
      if (!form) return;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const firstInput = form.querySelector('input');
      if (firstInput && document.activeElement === document.body) firstInput.focus({ preventScroll: true });
    }, 80);
  });
};
