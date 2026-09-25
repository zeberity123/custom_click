// Keep Android's ahead-of-time Back callback enabled only while an overlay is open.
export function setupAndroidBack(isDrawerOpen, closeDrawer) {
  const native = window.NativeClick;
  if (!native) return;
  const dialogs = [...document.querySelectorAll('dialog')];
  let enabled;
  function sync() {
    const next = dialogs.some(dialog => dialog.open) || isDrawerOpen();
    if (next !== enabled) {
      enabled = next;
      native.setBackHandlerEnabled?.(next);
    }
  }
  window.handleAndroidBack = () => {
    const dialog = dialogs.find(dialog => dialog.open && dialog.contains(document.activeElement))
      ?? [...dialogs].reverse().find(dialog => dialog.open);
    if (dialog) {
      // Use the same cancellation path as Escape, including stopping MP3 rendering.
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    } else if (isDrawerOpen()) {
      closeDrawer();
    } else {
      sync();
      return false;
    }
    sync();
    return true;
  };
  const observer = new MutationObserver(sync);
  for (const dialog of dialogs) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  sync();
}
