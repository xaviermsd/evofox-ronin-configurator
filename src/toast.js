/**
 * Toast system — vanilla port of the Electric Lime Toaster (Appendix D).
 * Kinds: success | error | warning | info | busy. Max 3 visible, newest at
 * the bottom. Hover pauses the timer. Reusing an id updates a toast in place.
 * At most one action (small lime pill: Undo, Retry, View).
 */
import { icon } from './icons.js';
import { spinner } from './feedback.js';

const DEFAULTS = { success: 3500, info: 3500, warning: 6000, error: 8000, busy: 0 };
const MAX_VISIBLE = 3;

export function createToaster(container) {
  const list = new Map();   // id -> { el, data, timer }
  let seq = 0;

  const esc = (str) => String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render(t) {
    const d = t.data;
    const kind = d.kind || 'info';
    const timed = t.el.classList.contains('is-timed');
    t.el.className = `toast ${kind}${timed ? ' is-timed' : ''}`;
    t.el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.el.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    const glyph = kind === 'busy' ? spinner(18, 'on-ink')
      : kind === 'success' ? icon('check', 18)
      : kind === 'info' ? icon('info', 18)
      : kind === 'error' ? icon('x', 18)
      : icon('alert', 18);
    const label = { success: 'Done', error: 'Error', warning: 'Heads up', info: 'Info', busy: 'Working' }[kind] || 'Info';
    t.el.innerHTML = `
      <span class="toast-icon">${glyph}</span>
      <div class="toast-body">
        <span class="toast-kind">${label}</span>
        <strong>${esc(d.title)}</strong>
        ${d.message ? `<p>${esc(d.message)}</p>` : ''}
        ${d.progress !== undefined ? `<div class="toast-progress"><span style="width:${Math.round(d.progress * 100)}%"></span></div>` : ''}
        ${d.action ? `<button type="button" class="toast-action">${esc(d.action.label)}</button>` : ''}
      </div>
      ${kind !== 'busy' ? `<button type="button" class="toast-close" aria-label="Dismiss">${icon('x', 16)}</button>` : ''}
      ${kind !== 'busy' ? '<span class="toast-timer" aria-hidden="true"></span>' : (d.progress === undefined ? '<span class="toast-loading" aria-hidden="true"></span>' : '')}`;
    t.el.querySelector('.toast-close')?.addEventListener('click', () => dismiss(t.id));
    t.el.querySelector('.toast-action')?.addEventListener('click', () => { d.action.onClick(); dismiss(t.id); });
  }

  function arm(t) {
    clearTimeout(t.timer);
    const ms = t.data.duration ?? DEFAULTS[t.data.kind || 'info'];
    if (ms > 0) {
      t.deadline = Date.now() + ms;
      t.timer = setTimeout(() => dismiss(t.id), ms);
      // restart the countdown bar
      t.el.style.setProperty('--dur', `${ms}ms`);
      t.el.classList.remove('is-timed');
      void t.el.offsetWidth;
      t.el.classList.add('is-timed');
    } else {
      t.el.classList.remove('is-timed');
    }
  }

  function dismiss(id) {
    const t = list.get(id);
    if (!t || t.leaving) return;
    clearTimeout(t.timer);
    t.leaving = true;
    t.el.classList.add('leaving');
    setTimeout(() => { t.el.remove(); list.delete(id); }, 220);   // = toast-leave
  }

  function show(input) {
    const id = input.id ?? `t${++seq}`;
    const existing = list.get(id);
    if (existing && !existing.leaving) { update(id, input); return id; }

    const t = { id, data: { kind: 'info', ...input }, el: document.createElement('div'), timer: null };
    t.el.addEventListener('mouseenter', () => clearTimeout(t.timer));
    t.el.addEventListener('mouseleave', () => arm(t));
    render(t);
    list.set(id, t);
    container.appendChild(t.el);

    // drop the oldest non-busy toast when over the limit
    const live = [...list.values()].filter((x) => !x.leaving);
    if (live.length > MAX_VISIBLE) {
      const oldest = live.find((x) => x.data.kind !== 'busy');
      if (oldest) dismiss(oldest.id);
    }
    arm(t);
    return id;
  }

  function update(id, patch) {
    const t = list.get(id);
    if (!t) return;
    t.data = { ...t.data, ...patch };
    render(t);
    if (patch.kind || patch.duration !== undefined) arm(t);
  }

  async function promise(p, m) {
    const id = show({ kind: 'busy', title: m.loading });
    try {
      const v = await p;
      update(id, { kind: 'success', title: m.success, duration: DEFAULTS.success });
      return v;
    } catch (e) {
      update(id, { kind: 'error', title: m.error(e), duration: DEFAULTS.error });
      throw e;
    }
  }

  return { show, update, dismiss, promise };
}
