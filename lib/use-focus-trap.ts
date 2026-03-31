import { useEffect, type RefObject } from 'react';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        previouslyFocused?.focus();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    el.addEventListener('keydown', handler);
    // Focus first focusable element
    const items = focusable();
    if (items.length > 0) items[0].focus();

    return () => {
      el.removeEventListener('keydown', handler);
      previouslyFocused?.focus();
    };
  }, [ref, active]);
}
