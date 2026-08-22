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

    // React changes login/signup mode after the click. Wait for the new form,
    // then bring the full auth card into view and focus the first field.
    window.setTimeout(() => {
      const form = document.querySelector('main form');
      if (!form) return;

      const panel = form.closest('.max-w-xl') || form;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      window.setTimeout(() => {
        const firstInput = form.querySelector('input:not([type="hidden"]):not([disabled])');
        if (firstInput) firstInput.focus({ preventScroll: true });
      }, 220);
    }, 60);
  });
};
