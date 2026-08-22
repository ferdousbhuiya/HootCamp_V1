import { useEffect } from 'react';

const MODE_BUTTON_LABELS = new Set([
  'create account',
  'create an account',
  'sign in'
]);

export default function AuthScrollBehavior() {
  useEffect(() => {
    const handleClick = (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      const label = String(button.textContent || '').trim().toLowerCase();
      if (!MODE_BUTTON_LABELS.has(label)) return;

      // Auth changes mode first. Scroll after React has rendered the new form.
      window.setTimeout(() => {
        const form = document.querySelector('main form');
        if (!form) return;

        const panel = form.closest('.max-w-xl') || form;
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

        window.setTimeout(() => {
          const firstInput = form.querySelector('input:not([type="hidden"])');
          if (firstInput) firstInput.focus({ preventScroll: true });
        }, 250);
      }, 0);
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return null;
}
