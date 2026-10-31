/**
 * Shared UI behaviour for the Electric Lime system (no dependencies):
 *  - Dialogs: focus moves in on open, Tab is trapped, Esc closes (by clicking
 *    the dialog's own close button), focus returns to the trigger.
 *  - Icons: <i data-icon> placeholders are hydrated, including ones added later.
 *  - Delayed flag: show a loader only after 300ms, keep it for at least 500ms.
 *  - Undo stack for Ctrl/Cmd+Z (undo-instead-of-confirm pattern).
 */
import { hydrateIcons } from './icons.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ---------------- dialogs ---------------- */
const DIALOG_SELECTOR = '.modal-overlay, .modal-backdrop';
const isOpen = (el) => el.classList.contains('open') || el.classList.contains('active');
const returnFocus = new WeakMap();

function onDialogOpened(veil) {
  returnFocus.set(veil, document.activeElement);
  const surface = veil.querySelector('.modal-surface, .modal-card') || veil;
  const target = surface.querySelector('input[type="search"], input[type="text"]') ||
                 surface.querySelector('.modal-footer .btn-action-primary, .modal-actions .btn-action-secondary') ||
                 surface.querySelector(FOCUSABLE);
  requestAnimationFrame(() => target?.focus({ preventScroll: true }));
}

function onDialogClosed(veil) {
  const prev = returnFocus.get(veil);
  if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
  returnFocus.delete(veil);
}

function topDialog() {
  const open = [...document.querySelectorAll(DIALOG_SELECTOR)].filter(isOpen);
  return open[open.length - 1] || null;
}

export function initDialogs() {
  document.querySelectorAll(DIALOG_SELECTOR).forEach((veil) => {
    let was = isOpen(veil);
    new MutationObserver(() => {
      const now = isOpen(veil);
      if (now && !was) onDialogOpened(veil);
      if (!now && was) onDialogClosed(veil);
      was = now;
    }).observe(veil, { attributes: true, attributeFilter: ['class'] });

    // click on the veil itself closes (same as the close button)
    veil.addEventListener('click', (e) => {
      if (e.target === veil) veil.querySelector('.modal-close-btn, .modal-close')?.click();
    });
  });

  document.addEventListener('keydown', (e) => {
    const veil = topDialog();
    if (!veil) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      veil.querySelector('.modal-close-btn, .modal-close')?.click();
      return;
    }
    if (e.key === 'Tab') {
      const items = [...veil.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!veil.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ---------------- icons ---------------- */
export function initIcons() {
  hydrateIcons(document);
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => { if (n.nodeType === 1) hydrateIcons(n.matches?.('i[data-icon]') ? n.parentNode : n); });
    }
  }).observe(document.body, { childList: true, subtree: true });
}

/* ---------------- delayed loader flag ---------------- */
export function delayedFlag(onShow, onHide, delay = 300, minShow = 500) {
  let showTimer = null, shownAt = 0, shown = false, hideTimer = null;
  return {
    start() {
      clearTimeout(hideTimer);
      if (shown || showTimer) return;
      showTimer = setTimeout(() => { showTimer = null; shown = true; shownAt = Date.now(); onShow(); }, delay);
    },
    stop() {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; return; }
      if (!shown) return;
      const left = Math.max(0, minShow - (Date.now() - shownAt));
      hideTimer = setTimeout(() => { shown = false; onHide(); }, left);
    },
    get visible() { return shown; },
  };
}

/* ---------------- undo (Ctrl/Cmd+Z) ---------------- */
let lastUndo = null;

export function registerUndo(fn, ms = 6000) {
  lastUndo = { fn, until: Date.now() + ms };
}

export function runUndo() {
  if (!lastUndo || Date.now() > lastUndo.until) return false;
  const { fn } = lastUndo;
  lastUndo = null;
  fn();
  return true;
}

export function initUndoShortcut() {
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (runUndo()) e.preventDefault();
  });
}

/* ---------------- keyboard access for clickable tiles ---------------- */
const CLICKABLE = '.mode-tile, .swatch-circle, .slot-pill';

function makeFocusable(root) {
  const nodes = root.matches?.(CLICKABLE) ? [root] : [...(root.querySelectorAll?.(CLICKABLE) || [])];
  nodes.forEach((el) => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (el.classList.contains('swatch-circle') && !el.hasAttribute('aria-label')) {
      el.setAttribute('aria-label', el.title || el.dataset.color || 'Colour');
    }
  });
}

export function initClickables() {
  makeFocusable(document.body);
  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) makeFocusable(n); }));
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.(CLICKABLE)) {
      e.preventDefault();
      e.target.click();
    }
  });
}
