// One fixed feedback slot: a newer result replaces the visible one.
export function createToast(element, {schedule = setTimeout, cancel = clearTimeout} = {}) {
  let timer = null;
  function hide() {
    cancel(timer);
    timer = null;
    const node = element();
    if (node) node.className = 'toast';
  }
  return {
    show(kind, text) {
      const node = element();
      if (!node) return;
      cancel(timer);
      node.textContent = text;
      node.className = `toast visible ${kind === 'error' ? 'error' : 'success'}`;
      timer = schedule(hide, kind === 'error' ? 5000 : 3000);
    },
    hide,
  };
}
