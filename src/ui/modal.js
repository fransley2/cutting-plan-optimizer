// Modal único e genérico. Em vez de um <div id="modal"> por funcionalidade
// (como no arquivo original: um modal para salvar, outro para carregar...),
// existe UM elemento no DOM e essa função decide o conteúdo a cada chamada.

let overlay, titleEl, bodyEl, footerEl, onCloseHandler;
const modalStack = [];

function ensureModalDOM() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal">
      <header class="modal-header">
        <h3 id="modal-title"></h3>
        <button class="modal-close" aria-label="Fechar">&times;</button>
      </header>
      <div class="modal-body" id="modal-body"></div>
      <footer class="modal-footer" id="modal-footer"></footer>
    </div>`;
  document.body.appendChild(overlay);
  titleEl = overlay.querySelector('#modal-title');
  bodyEl = overlay.querySelector('#modal-body');
  footerEl = overlay.querySelector('#modal-footer');

  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

export function closeModal() {
  const wasOpen = overlay && !overlay.classList.contains('hidden');
  if (!wasOpen) return;
  const handler = onCloseHandler;
  onCloseHandler = null;
  handler?.();
  const previous = modalStack.pop();
  if (previous) {
    titleEl.textContent = previous.title;
    bodyEl.replaceChildren(...previous.bodyNodes);
    footerEl.replaceChildren(...previous.footerNodes);
    overlay.classList.toggle('modal-wide', previous.wide);
    onCloseHandler = previous.onCloseHandler;
    return;
  }
  overlay.classList.add('hidden');
}

/**
 * @param {string} title
 * @param {HTMLElement|string} body
 * @param {Array<{label:string, variant?:string, onClick?:Function, closeOnClick?:boolean}>} buttons
 */
export function openModal({ title, body, buttons = [], wide = false, onClose = null, stacked = false }) {
  ensureModalDOM();
  if (stacked && !overlay.classList.contains('hidden')) {
    modalStack.push({
      title: titleEl.textContent,
      bodyNodes: [...bodyEl.childNodes],
      footerNodes: [...footerEl.childNodes],
      wide: overlay.classList.contains('modal-wide'),
      onCloseHandler,
    });
  }
  onCloseHandler = typeof onClose === 'function' ? onClose : null;
  titleEl.textContent = title;
  bodyEl.innerHTML = '';
  bodyEl.append(typeof body === 'string' ? Object.assign(document.createElement('div'), { innerHTML: body }) : body);

  footerEl.innerHTML = '';
  buttons.forEach(btn => {
    const el = document.createElement('button');
    el.textContent = btn.label;
    el.className = `btn ${btn.variant || 'btn-secondary'}`;
    el.addEventListener('click', async () => {
      await btn.onClick?.();
      if (btn.closeOnClick !== false) closeModal();
    });
    footerEl.appendChild(el);
  });

  overlay.classList.toggle('modal-wide', wide);
  overlay.classList.remove('hidden');
  return { bodyEl };
}
