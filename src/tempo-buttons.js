// Shared by desktop, Android and iOS. Never leave a repeat running after input ends.
export function setupTempoButton(button, changeTempo) {
  let timer, pointerId = null, heldKey = null, suppressClick = false;
  function stop() {
    clearTimeout(timer);
    const captured = pointerId;
    pointerId = null;
    heldKey = null;
    if (captured !== null && button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
  }
  function start(shiftKey) {
    changeTempo(shiftKey ? 10 : 1);
    timer = setTimeout(function repeat() {
      if (button.disabled || button.closest('[inert]')) { stop(); return; }
      changeTempo(10);
      timer = setTimeout(repeat, 250);
    }, 400);
  }
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || pointerId !== null || heldKey !== null) return;
    pointerId = event.pointerId;
    suppressClick = true;
    button.setPointerCapture(pointerId);
    start(event.shiftKey);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => { if (event.pointerId === pointerId) stop(); });
  }
  button.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const box = button.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) stop();
  });
  button.addEventListener('click', event => {
    // Pointer presses already applied their first step. Keep assistive activation working.
    if (suppressClick && (event.detail > 0 || event.pointerType)) { suppressClick = false; return; }
    changeTempo(event.shiftKey ? 10 : 1);
  });
  button.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || heldKey !== null || pointerId !== null) return;
    heldKey = event.key;
    start(event.shiftKey);
  });
  button.addEventListener('keyup', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === heldKey) stop();
  });
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('blur', stop);
  window.addEventListener('blur', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
}
