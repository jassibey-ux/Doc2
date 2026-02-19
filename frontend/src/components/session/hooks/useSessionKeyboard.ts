/**
 * useSessionKeyboard — Keyboard shortcut handler for live session page.
 *
 * Shortcuts:
 *   J - Toggle jam (jam_on / jam_off)
 *   E - Engage
 *   D - Disengage
 *   L - Launch
 *   R - Recover
 *   F - Failsafe
 *   N - Note
 *   T - Toggle tactical mode
 *   ESC - Deselect / close panels
 *   Space - Toggle quick actions toolbar
 */

import { useEffect } from 'react';

export interface SessionKeyboardActions {
  onJam: () => void;
  onEngage: () => void;
  onDisengage: () => void;
  onLaunch: () => void;
  onRecover: () => void;
  onFailsafe: () => void;
  onNote: () => void;
  onToggleTactical: () => void;
  onEscape: () => void;
  onToggleToolbar: () => void;
}

export function useSessionKeyboard(
  actions: SessionKeyboardActions,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Don't capture with modifier keys (except shift)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault();
          actions.onJam();
          break;
        case 'e':
          e.preventDefault();
          actions.onEngage();
          break;
        case 'd':
          e.preventDefault();
          actions.onDisengage();
          break;
        case 'l':
          e.preventDefault();
          actions.onLaunch();
          break;
        case 'r':
          e.preventDefault();
          actions.onRecover();
          break;
        case 'f':
          e.preventDefault();
          actions.onFailsafe();
          break;
        case 'n':
          e.preventDefault();
          actions.onNote();
          break;
        case 't':
          e.preventDefault();
          actions.onToggleTactical();
          break;
        case 'escape':
          e.preventDefault();
          actions.onEscape();
          break;
        case ' ':
          e.preventDefault();
          actions.onToggleToolbar();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, enabled]);
}
