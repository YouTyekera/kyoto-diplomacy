/** Clipboard API for secure contexts; selection-copy fallback for an HTTP LAN. */
export async function copyText(value: string) {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(value); return; } } catch { /* Try the browser's selection copy. */ }
  const previous = document.activeElement;
  const field = document.createElement('textarea'); field.value = value; field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed'; field.style.opacity = '0';
  document.body.appendChild(field); field.select();
  try { if (!document.execCommand('copy')) throw new Error('Clipboard unavailable'); }
  finally { field.remove(); if (previous instanceof HTMLElement) previous.focus(); }
}
