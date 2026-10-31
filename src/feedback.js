/**
 * feedback.js: one branded loading & feedback system for the whole app.
 *
 *   spinner(size)              branded ring (lime arc on an ink track)
 *   busyButton(btn, label)     spinner + "Saving…" label, disabled, aria-busy;
 *                              returns restore(), or null if already busy
 *                              (this is what prevents double submits)
 *   busySection(el, label)     card-level overlay for medium operations;
 *                              returns done()
 *   hideSplash()               fades the first-load splash into the app
 *
 * Full-screen waits (connect, factory reset) use the existing loader in
 * app.js, restyled to match (src/feedback.css). Toasts are shown by the
 * callers only after the real operation has succeeded or failed.
 */

export function spinner(size = 16, cls = '') {
  return `<span class="bspin ${cls}" style="--s:${size}px" aria-hidden="true"></span>`;
}

export function busyButton(btn, label = 'Saving…') {
  if (!btn) return () => {};
  if (btn.dataset.busy === '1') return null;          // already running
  const html = btn.innerHTML;
  const wasDisabled = btn.disabled;
  const width = btn.getBoundingClientRect().width;
  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.classList.add('is-busy');
  btn.style.minWidth = `${Math.ceil(width)}px`;      // no layout jump
  btn.innerHTML = `${spinner(16, 'on-btn')}<span>${label}</span>`;
  return () => {
    btn.innerHTML = html;
    btn.disabled = wasDisabled;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-busy');
    btn.style.minWidth = '';
    delete btn.dataset.busy;
  };
}

export function busySection(el, label = 'Working…') {
  if (!el) return () => {};
  el.querySelector(':scope > .section-busy')?.remove();
  const veil = document.createElement('div');
  veil.className = 'section-busy';
  veil.setAttribute('role', 'status');
  veil.setAttribute('aria-live', 'polite');
  veil.innerHTML = `<div class="section-busy-card">${spinner(22)}<span>${label}</span></div>`;
  el.classList.add('has-section-busy');
  el.appendChild(veil);
  return () => {
    veil.classList.add('is-leaving');
    setTimeout(() => { veil.remove(); el.classList.remove('has-section-busy'); }, 220);
  };
}

let splashHidden = false;
export function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  const s = document.getElementById('appSplash');
  if (!s) return;
  s.classList.add('is-leaving');
  document.documentElement.classList.remove('is-booting');
  s.addEventListener('animationend', () => s.remove(), { once: true });
  setTimeout(() => s.remove(), 900);                  // safety net
}
