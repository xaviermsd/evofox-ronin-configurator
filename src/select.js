/**
 * select.js: branded dropdown (combobox + listbox) for every <select>.
 *
 *   enhanceSelect(selectEl)      upgrade one <select>
 *   enhanceAllSelects(root)      upgrade every <select> under root
 *
 * The native <select> stays in the DOM, visually hidden, and remains the
 * single source of truth: app code keeps reading/writing `.value`,
 * rebuilding <option>s and listening for `change` exactly as before.
 * The custom control mirrors it:
 *   - option list changes   -> MutationObserver rebuilds the menu
 *   - `.value` / `.selectedIndex` set from code -> instance setters refresh
 *   - user picks an option  -> sets the native value + dispatches
 *                              `input` and `change` (bubbling)
 *
 * Accessibility: WAI-ARIA "select-only combobox" pattern. Focus stays on the
 * trigger; the active option is announced via aria-activedescendant.
 * Keys: ↑/↓/Home/End/PageUp/PageDown, Enter/Space, Esc, Tab, Alt+↓/↑,
 * and type-ahead.
 */

let uid = 0;
let openInstance = null;

const proto = HTMLSelectElement.prototype;
const valueDesc = Object.getOwnPropertyDescriptor(proto, 'value');
const indexDesc = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');

const CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

export function enhanceAllSelects(root = document) {
  root.querySelectorAll('select:not([data-bsel]):not([hidden])').forEach(enhanceSelect);
}

export function enhanceSelect(select) {
  if (!select || select.dataset.bsel) return;
  const id = `bsel-${++uid}`;
  select.dataset.bsel = id;

  // ---- DOM ---------------------------------------------------------------
  const wrap = document.createElement('div');
  wrap.className = 'bsel';
  if (select.style.flex) wrap.style.flex = select.style.flex;
  select.removeAttribute('style');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'bsel-trigger';
  trigger.id = `${id}-btn`;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${id}-list`);
  trigger.innerHTML = `<span class="bsel-value"></span><span class="bsel-chevron">${CHEVRON}</span>`;
  const valueEl = trigger.firstElementChild;

  const list = document.createElement('ul');
  list.className = 'bsel-menu';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;

  // label wiring: <label for=select> now names (and focuses) the trigger
  const label = select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
  if (label) {
    if (!label.id) label.id = `${id}-label`;
    trigger.setAttribute('aria-labelledby', `${label.id} ${trigger.id}`);
    list.setAttribute('aria-labelledby', label.id);
    label.htmlFor = trigger.id;
  } else if (select.getAttribute('aria-label')) {
    trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
    list.setAttribute('aria-label', select.getAttribute('aria-label'));
  }

  select.classList.add('bsel-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.parentNode.insertBefore(wrap, select);
  wrap.append(select, trigger);

  // ---- state ---------------------------------------------------------------
  let items = [];          // [{el, opt}]
  let active = -1;
  let typed = '', typedAt = 0;

  const enabledIdx = () => items.map((it, i) => (it.opt.disabled ? -1 : i)).filter(i => i >= 0);

  function build() {
    list.innerHTML = '';
    items = [...select.options].map((opt, i) => {
      const li = document.createElement('li');
      li.id = `${id}-opt-${i}`;
      li.className = 'bsel-option';
      li.setAttribute('role', 'option');
      li.dataset.index = i;
      if (opt.disabled) li.setAttribute('aria-disabled', 'true');
      li.innerHTML = `<span class="bsel-option-text"></span><span class="bsel-check">${CHECK}</span>`;
      li.firstElementChild.textContent = opt.textContent;
      list.appendChild(li);
      return { el: li, opt };
    });
    sync();
  }

  function sync() {
    const i = indexDesc.get.call(select);
    const opt = select.options[i];
    valueEl.textContent = opt ? opt.textContent : '';
    trigger.title = opt ? opt.textContent : '';
    items.forEach((it, k) => it.el.setAttribute('aria-selected', String(k === i)));
    trigger.disabled = select.disabled;
    wrap.classList.toggle('is-disabled', select.disabled);
  }

  function setActive(i, scroll = true) {
    if (active >= 0 && items[active]) items[active].el.classList.remove('is-active');
    active = i;
    const it = items[i];
    if (!it) { trigger.removeAttribute('aria-activedescendant'); return; }
    it.el.classList.add('is-active');
    trigger.setAttribute('aria-activedescendant', it.el.id);
    if (scroll) it.el.scrollIntoView({ block: 'nearest' });
  }

  function place() {
    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth, gap = 6, margin = 12;
    list.style.minWidth = `${r.width}px`;
    list.style.maxWidth = `${Math.max(r.width, Math.min(440, vw - 2 * margin))}px`;
    const below = vh - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const natural = Math.min(list.scrollHeight + 2, 320);
    const up = below < Math.min(natural, 200) && above > below;
    const maxH = Math.max(120, Math.min(320, up ? above : below));
    list.style.maxHeight = `${maxH}px`;
    const w = list.offsetWidth;
    const left = Math.min(Math.max(margin, r.left), vw - w - margin);
    list.style.left = `${left}px`;
    list.style.top = up ? '' : `${r.bottom + gap}px`;
    list.style.bottom = up ? `${vh - r.top + gap}px` : '';
    list.classList.toggle('is-up', up);
  }

  function open() {
    if (trigger.disabled || openInstance === api) return;
    openInstance?.close(false);
    openInstance = api;
    document.body.appendChild(list);
    list.classList.remove('is-leaving');
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    place();
    setActive(Math.max(0, indexDesc.get.call(select)));
    requestAnimationFrame(() => list.classList.add('is-open'));
    window.addEventListener('resize', onViewport);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onOutside, true);
  }

  function close(refocus = true) {
    if (openInstance !== api) return;
    openInstance = null;
    wrap.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    list.classList.remove('is-open');
    list.classList.add('is-leaving');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { if (openInstance !== api) list.remove(); }, reduce ? 0 : 140);
    window.removeEventListener('resize', onViewport);
    window.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus) trigger.focus({ preventScroll: true });
  }

  function choose(i) {
    const it = items[i];
    if (!it || it.opt.disabled) return;
    const changed = indexDesc.get.call(select) !== i;
    indexDesc.set.call(select, i);
    sync();
    close();
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function move(delta) {
    const en = enabledIdx();
    if (!en.length) return;
    let pos = en.indexOf(active);
    if (pos < 0) pos = delta > 0 ? -1 : en.length;
    setActive(en[Math.min(en.length - 1, Math.max(0, pos + delta))]);
  }

  function typeahead(ch) {
    const now = Date.now();
    typed = now - typedAt > 600 ? ch : typed + ch;
    typedAt = now;
    const en = enabledIdx();
    const start = active >= 0 ? en.indexOf(active) + (typed.length === 1 ? 1 : 0) : 0;
    const order = [...en.slice(start), ...en.slice(0, start)];
    const hit = order.find(i => items[i].opt.textContent.trim().toLowerCase().startsWith(typed));
    if (hit === undefined) return;
    if (openInstance === api) setActive(hit);
    else choose(hit);
  }

  // ---- events ---------------------------------------------------------------
  const onViewport = () => place();
  const onScroll = (e) => { if (!list.contains(e.target)) close(false); };
  const onOutside = (e) => { if (!wrap.contains(e.target) && !list.contains(e.target)) close(false); };

  trigger.addEventListener('click', () => (openInstance === api ? close() : open()));
  trigger.addEventListener('keydown', (e) => {
    const isOpen = openInstance === api;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) open(); else if (e.altKey) choose(active); else move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) open(); else if (e.altKey) choose(active); else move(-1);
        break;
      case 'Home': if (isOpen) { e.preventDefault(); setActive(enabledIdx()[0]); } break;
      case 'End':  if (isOpen) { e.preventDefault(); setActive(enabledIdx().at(-1)); } break;
      case 'PageDown': if (isOpen) { e.preventDefault(); move(8); } break;
      case 'PageUp':   if (isOpen) { e.preventDefault(); move(-8); } break;
      case 'Enter':
      case ' ':
        if (e.key === ' ' && typed && Date.now() - typedAt < 600) { e.preventDefault(); typeahead(' '); break; }
        e.preventDefault();
        if (isOpen) choose(active); else open();
        break;
      case 'Escape': if (isOpen) { e.preventDefault(); e.stopPropagation(); close(); } break;
      case 'Tab': if (isOpen) { choose(active); } break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeahead(e.key.toLowerCase()); }
    }
  });
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('.bsel-option');
    if (li && !li.hasAttribute('aria-disabled') && +li.dataset.index !== active) setActive(+li.dataset.index, false);
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus on trigger
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.bsel-option');
    if (li) choose(+li.dataset.index);
  });
  // native change fired by other code paths
  select.addEventListener('change', sync);

  // programmatic value changes from app code
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); sync(); },
  });
  Object.defineProperty(select, 'selectedIndex', {
    configurable: true,
    get() { return indexDesc.get.call(this); },
    set(v) { indexDesc.set.call(this, v); sync(); },
  });

  new MutationObserver(build).observe(select, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['disabled', 'selected', 'label'],
  });

  const api = { open, close, sync, el: wrap };
  build();
  return api;
}
