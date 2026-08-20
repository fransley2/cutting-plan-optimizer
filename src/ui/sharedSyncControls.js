import { SyncConflictError, SyncLockError, SyncOwnLockError } from '../core/syncManager.js';

const WRITE_ACTION_PATTERN = /\b(salvar|save|adicionar|add|excluir|delete|remover|remove|importar|import|gerar|create|criar|editar|edit|alterar|update|aplicar|aceitar|vincular|unlink|enviar|emitir|dispatch|confirmar|liberar)\b/i;

function elapsedLabel(value, now = Date.now()) {
  const timestamp = new Date(value || '').getTime();
  if (!Number.isFinite(timestamp)) return 'tempo desconhecido';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}

function remainingLabel(lock, timeoutMs, now = Date.now()) {
  const acquiredAt = new Date(lock?.acquiredAt || '').getTime();
  if (!Number.isFinite(acquiredAt)) return 'tempo desconhecido';
  const remainingMs = Math.max(0, acquiredAt + timeoutMs - now);
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}

function lockTiming(lock, timeoutMs, now = Date.now()) {
  return `há ${elapsedLabel(lock?.acquiredAt, now)} · expira em ${remainingLabel(lock, timeoutMs, now)}`;
}

export function getSharedSyncIndicator(states, configured, sessionId = '', now = Date.now(), lockTimeoutMs = 15 * 60_000) {
  const latest = states.map((state) => state.lastSyncedAt).filter(Boolean).sort().at(-1) || '';
  const pendingCount = states.reduce((total, state) => total + (state.dirty ? Math.max(1, Number(state.pendingChanges) || 0) : 0), 0);
  const lockedState = states.find((state) => state.lock && state.lock.sessionId !== sessionId);
  if (!configured) return { kind: 'offline', label: 'Offline', icon: 'power_off', detail: 'Pasta compartilhada não configurada.', pendingCount, latest };
  if (states.some((state) => state.offline)) return { kind: 'offline', label: 'Offline', icon: 'power_off', detail: 'Sem acesso à pasta compartilhada.', pendingCount, latest };
  if (lockedState) {
    const store = lockedState.fileName?.replace(/\.json$/i, '').toUpperCase() || lockedState.key;
    const timing = lockTiming(lockedState.lock, lockTimeoutMs, now);
    if (lockedState.lock.ownedByCurrentUser) {
      return { kind: 'owned-lock', label: 'Editando em outra aba', icon: 'tab', detail: `Você mantém ${store} aberto em outro contexto · ${timing}.`, pendingCount, latest, lockKey: lockedState.key, lock: lockedState.lock };
    }
    return { kind: 'locked', label: 'Bloqueado', icon: 'lock', detail: `${lockedState.lock.userName || 'Outro usuário'} está editando ${store} · ${timing}.`, pendingCount, latest, lockKey: lockedState.key, lock: lockedState.lock };
  }
  if (states.some((state) => state.syncing)) return { kind: 'syncing', label: 'Sincronizando', icon: 'sync', detail: 'Sincronização em andamento.', pendingCount, latest };
  if (states.some((state) => state.newerAvailable)) return { kind: 'pending', label: 'Pendente', icon: 'schedule', detail: 'Há alterações novas de outro usuário — sincronizar.', pendingCount, latest };
  if (pendingCount) {
    const suffix = pendingCount === 1 ? 'alteração pendente' : 'alterações pendentes';
    return { kind: 'pending', label: 'Pendente', icon: 'schedule', detail: `${pendingCount} ${suffix}.`, pendingCount, latest };
  }
  return latest
    ? { kind: 'synced', label: 'Sincronizado', icon: 'check_circle', detail: `Sincronizado há ${elapsedLabel(latest, now)}.`, pendingCount, latest }
    : { kind: 'pending', label: 'Pendente', icon: 'schedule', detail: 'Sincronização inicial pendente.', pendingCount, latest };
}

function phaseRoot(phase) {
  const ids = {
    mto: 'mto-phase', inventory: 'inventory-phase', procurement: 'procurement-phase', projects: 'section-projects',
    equipments: 'section-equipments', drawings: 'section-drawings', workpacks: 'section-workpacks',
    'material-coupons': 'section-material-coupons', 'cut-sheets': 'cut-sheets-phase',
    'return-material': 'return-material-phase', audit: 'audit-phase',
  };
  return document.getElementById(ids[phase]);
}

function lockNotice(lock, timeoutMs) {
  const owner = lock.ownedByCurrentUser ? 'Você está editando em outra aba ou dispositivo' : `${lock.userName || 'Outro usuário'} está editando`;
  return `${owner} · ${lockTiming(lock, timeoutMs)}.`;
}

export function createSharedSyncControls({
  manager,
  adapter,
  syncKeysForPhase,
  getCurrentPhase,
  refreshCurrentPhase,
  resolveUserName,
  openModal,
  closeModal,
  showToast,
}) {
  let configured = false;
  let currentKeys = [];
  let lockedKeys = [];
  let unsubscribeState = null;
  let unsubscribeIdb = null;
  let readonlyRoot = null;
  let banner = null;
  let statusTimer = null;
  let directoryName = '';
  let popover = null;
  let readonlySignature = '';

  const button = () => document.getElementById('shared-sync-button');
  const label = () => document.querySelector('[data-shared-sync-label]');
  const icon = () => document.querySelector('[data-shared-sync-icon]');

  function currentStatus() {
    return getSharedSyncIndicator(manager.getStates(), configured, manager.sessionId, Date.now(), manager.lockTimeoutMs);
  }

  function renderStatus() {
    const status = currentStatus();
    const target = button();
    if (target) {
      target.dataset.syncStatus = status.kind;
      target.title = status.detail;
      target.setAttribute('aria-label', `Sincronização: ${status.detail}`);
    }
    if (label()) label().textContent = status.label;
    if (icon()) icon().textContent = status.icon;
    if (popover?.hidden === false) renderPopoverDetails(status);
  }

  function formatLastSync(value) {
    return value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não sincronizado';
  }

  function renderPopoverDetails(status = currentStatus()) {
    if (!popover) return;
    popover.querySelector('[data-sync-detail-pending]').textContent = String(status.pendingCount);
    popover.querySelector('[data-sync-detail-last]').textContent = formatLastSync(status.latest);
    popover.querySelector('[data-sync-detail-folder]').textContent = directoryName || 'Não configurada';
    const lockDetail = popover.querySelector('[data-sync-lock-detail]');
    const takeOver = popover.querySelector('[data-sync-take-over]');
    const forceRelease = popover.querySelector('[data-sync-force-release]');
    lockDetail.hidden = !status.lock;
    lockDetail.textContent = status.lock ? status.detail : '';
    takeOver.hidden = status.kind !== 'owned-lock';
    forceRelease.hidden = status.kind !== 'locked';
    takeOver.dataset.lockKey = status.kind === 'owned-lock' ? status.lockKey : '';
    forceRelease.dataset.lockKey = status.kind === 'locked' ? status.lockKey : '';
  }

  function positionPopover() {
    if (!popover || popover.hidden) return;
    const rect = button()?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.right - popover.offsetWidth, globalThis.innerWidth - popover.offsetWidth - 12);
    popover.style.left = `${Math.max(12, left)}px`;
    popover.style.top = `${rect.bottom + 8}px`;
  }

  function closePopover() {
    if (!popover) return;
    popover.hidden = true;
    button()?.setAttribute('aria-expanded', 'false');
  }

  async function openPopover() {
    if (!popover) return;
    const handle = await adapter.restoreDirectory().catch(() => null);
    directoryName = handle?.name || '';
    renderPopoverDetails();
    popover.hidden = false;
    button()?.setAttribute('aria-expanded', 'true');
    positionPopover();
  }

  function togglePopover() {
    if (popover?.hidden === false) closePopover();
    else void openPopover();
  }

  function handleOutsidePointer(event) {
    if (popover?.hidden !== false || button()?.contains(event.target) || popover.contains(event.target)) return;
    closePopover();
  }

  function handlePopoverKeydown(event) {
    if (event.key !== 'Escape' || popover?.hidden !== false) return;
    closePopover();
    button()?.focus();
  }

  function createPopover() {
    const panel = document.createElement('section');
    panel.className = 'shared-sync-popover';
    panel.id = 'shared-sync-popover';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Detalhes da sincronização');
    const heading = document.createElement('strong');
    heading.textContent = 'Sincronização compartilhada';
    const details = document.createElement('dl');
    [
      ['Alterações pendentes', 'sync-detail-pending'],
      ['Último sync', 'sync-detail-last'],
      ['Pasta', 'sync-detail-folder'],
    ].forEach(([term, field]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.setAttribute(`data-${field}`, '');
      details.append(dt, dd);
    });
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-primary btn-sm';
    action.textContent = 'Sincronizar agora';
    action.addEventListener('click', () => {
      closePopover();
      void syncNow();
    });
    const lockDetail = document.createElement('p');
    lockDetail.className = 'shared-sync-lock-detail';
    lockDetail.dataset.syncLockDetail = '';
    lockDetail.hidden = true;
    const lockActions = document.createElement('div');
    lockActions.className = 'shared-sync-lock-actions';
    const takeOver = document.createElement('button');
    takeOver.type = 'button';
    takeOver.className = 'btn btn-secondary btn-sm';
    takeOver.dataset.syncTakeOver = '';
    takeOver.textContent = 'Assumir aqui';
    takeOver.hidden = true;
    takeOver.addEventListener('click', () => void takeOverHere(takeOver.dataset.lockKey));
    const forceRelease = document.createElement('button');
    forceRelease.type = 'button';
    forceRelease.className = 'btn btn-critical btn-sm';
    forceRelease.dataset.syncForceRelease = '';
    forceRelease.textContent = 'Forçar liberação';
    forceRelease.hidden = true;
    forceRelease.addEventListener('click', () => void confirmForceRelease([forceRelease.dataset.lockKey]));
    lockActions.append(takeOver, forceRelease);
    panel.append(heading, details, lockDetail, lockActions, action);
    document.body.append(panel);
    return panel;
  }

  function clearReadonly() {
    readonlyRoot?.removeAttribute('data-sync-readonly');
    banner?.remove();
    readonlyRoot = null;
    banner = null;
    lockedKeys = [];
    readonlySignature = '';
  }

  function blockReadonlyWrites(event) {
    const root = event.target?.closest?.('[data-sync-readonly]');
    if (!root) return;
    const control = event.target.closest('button, input[type="file"], input[type="submit"], [role="button"]');
    if (!control || control.classList.contains('sync-readonly-allowed')) return;
    const action = `${control.textContent || ''} ${control.title || ''} ${control.getAttribute('aria-label') || ''}`;
    if (!WRITE_ACTION_PATTERN.test(action) && control.type !== 'submit' && control.type !== 'file') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast('Tela em modo leitura enquanto outro usuario mantem o lock.', 'warning');
  }

  async function confirmForceRelease(keys = lockedKeys) {
    const targetKeys = keys.filter(Boolean);
    const lockStates = targetKeys.map((key) => manager.getState(key)).filter((state) => state.lock && !state.lock.ownedByCurrentUser);
    if (!lockStates.length) return;
    const body = document.createElement('div');
    const warning = document.createElement('p');
    warning.textContent = `O lock pertence a ${lockStates[0].lock.userName || 'outro usuário'}, ativo ${lockTiming(lockStates[0].lock, manager.lockTimeoutMs)}. Force somente se tiver certeza de que a edição não está ativa.`;
    const confirmation = document.createElement('input');
    confirmation.type = 'text';
    confirmation.placeholder = 'Digite LIBERAR LOCK';
    body.append(warning, confirmation);
    openModal({
      title: 'Forcar liberacao do lock',
      body,
      buttons: [
        { label: 'Cancelar', variant: 'btn-ghost' },
        { label: 'Forcar liberacao', variant: 'btn-critical', closeOnClick: false, onClick: async () => {
          if (confirmation.value.trim() !== 'LIBERAR LOCK') {
            showToast('Digite LIBERAR LOCK para confirmar.', 'error');
            return;
          }
          try {
            await Promise.all(targetKeys.map((key) => manager.releaseLock(key, { force: true })));
            closeModal();
            clearReadonly();
            await enterPhase(getCurrentPhase());
            showToast('Lock liberado. Esta sessao assumiu a edicao.', 'success');
          } catch (error) {
            showToast(error.message || 'Nao foi possivel liberar o lock.', 'error');
          }
        } },
      ],
    });
  }

  async function takeOverHere(key) {
    if (!key) return false;
    try {
      await manager.takeOverLock(key);
      closePopover();
      reconcileReadonlyFromState();
      showToast('Lock assumido nesta aba.', 'success');
      return true;
    } catch (error) {
      showToast(error.message || 'Não foi possível assumir o lock nesta aba.', 'error');
      return false;
    }
  }

  function setReadonly(phase, locks) {
    const signature = locks.map(({ key, lock }) => `${key}:${lock.sessionId}:${lock.acquiredAt}`).join('|');
    if (signature === readonlySignature && readonlyRoot === phaseRoot(phase)) {
      banner?.querySelector('[data-sync-lock-message]')?.replaceChildren(lockNotice(locks[0].lock, manager.lockTimeoutMs));
      return;
    }
    clearReadonly();
    readonlyRoot = phaseRoot(phase);
    if (!readonlyRoot) return;
    lockedKeys = locks.map(({ key }) => key);
    readonlySignature = signature;
    readonlyRoot.dataset.syncReadonly = 'true';
    banner = document.createElement('aside');
    banner.className = `shared-sync-banner ${locks[0].lock.ownedByCurrentUser ? 'is-owned-lock' : 'is-locked'}`;
    banner.setAttribute('role', 'status');
    const message = document.createElement('span');
    message.dataset.syncLockMessage = '';
    message.textContent = lockNotice(locks[0].lock, manager.lockTimeoutMs);
    const action = document.createElement('button');
    action.type = 'button';
    action.className = `btn ${locks[0].lock.ownedByCurrentUser ? 'btn-secondary' : 'btn-critical'} btn-sm sync-readonly-allowed`;
    action.textContent = locks[0].lock.ownedByCurrentUser ? 'Assumir aqui' : 'Forçar liberação do lock';
    action.addEventListener('click', () => {
      if (locks[0].lock.ownedByCurrentUser) void takeOverHere(locks[0].key);
      else void confirmForceRelease(lockedKeys);
    });
    banner.append(message, action);
    readonlyRoot.prepend(banner);
  }

  function reconcileReadonlyFromState() {
    if (!currentKeys.length) return;
    const locks = currentKeys
      .map((key) => ({ key, lock: manager.getState(key).lock }))
      .filter(({ lock }) => lock && lock.sessionId !== manager.sessionId);
    if (locks.length) setReadonly(getCurrentPhase(), locks);
    else if (readonlyRoot) clearReadonly();
  }

  function handleManagerState() {
    renderStatus();
    reconcileReadonlyFromState();
  }

  function showOfflineNotice() {
    showToast('Sem acesso a pasta compartilhada — trabalhando offline. Suas alteracoes serao sincronizadas quando a conexao voltar.', 'warning');
  }

  async function ensureConnected({ select = false, request = false, onBeforeCommit } = {}) {
    let handle;
    if (select) handle = await adapter.selectDirectory({ onBeforeCommit });
    else {
      handle = await adapter.restoreDirectory();
      if (!handle) return false;
      const permission = request ? await adapter.requestPermission() : await adapter.queryPermission();
      if (permission !== 'granted') return false;
    }
    configured = true;
    directoryName = handle?.name || '';
    renderStatus();
    return true;
  }

  async function connectOrChangeFolder() {
    try {
      await ensureConnected({
        select: true,
        onBeforeCommit: configured ? () => manager.releaseLocks() : null,
      });
      await manager.resetRemoteContext({ preserveDirty: true });
      const results = await manager.loadStores();
      const failures = results.filter((result) => result.error);
      if (failures.length) throw failures[0].error;
      renderStatus();
      await refreshCurrentPhase?.();
      showToast('Pasta compartilhada configurada e dados carregados.', 'success');
      return true;
    } catch (error) {
      configured = Boolean(await adapter.restoreDirectory().catch(() => null));
      if (configured) await enterPhase(getCurrentPhase());
      renderStatus();
      showToast(error.message || 'Nao foi possivel configurar a pasta compartilhada.', 'error');
      return false;
    }
  }

  async function reconnect() {
    try {
      if (!await ensureConnected({ request: true })) throw new Error('A permissao para a pasta compartilhada nao foi concedida.');
      const results = await manager.loadStores(currentKeys.length ? currentKeys : undefined);
      const failure = results.find((result) => result.error);
      if (failure) throw failure.error;
      await refreshCurrentPhase?.();
      showToast('Conexao com a pasta compartilhada restabelecida.', 'success');
      return true;
    } catch (error) {
      showOfflineNotice();
      return false;
    }
  }

  async function openConflict(error) {
    const remote = error.remote || {};
    const modifier = await resolveUserName?.(remote.lastModifiedBy) || remote.lastModifiedBy || 'Outro usuario';
    const when = remote.lastModifiedAt ? new Date(remote.lastModifiedAt).toLocaleString('pt-BR') : 'horario desconhecido';
    const body = document.createElement('p');
    body.textContent = `${modifier} salvou alteracoes em ${when}. Recarregue antes de salvar para nao perder o trabalho dele.`;
    openModal({
      title: 'Conflito de sincronizacao',
      body,
      buttons: [
        { label: 'Cancelar', variant: 'btn-ghost' },
        { label: 'Recarregar', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
          try {
            await manager.reloadStore(error.storeKey);
            closeModal();
            await refreshCurrentPhase?.();
            showToast('Dados compartilhados recarregados. Alteracoes locais nao salvas foram descartadas.', 'success');
          } catch (reloadError) {
            showToast(reloadError.message || 'Nao foi possivel recarregar os dados.', 'error');
          }
        } },
      ],
    });
  }

  async function syncNow() {
    if (!configured) return connectOrChangeFolder();
    try {
      const permission = await adapter.queryPermission();
      if (permission !== 'granted' && !await ensureConnected({ request: true })) return false;
      const allKeys = manager.getStates().map((state) => state.key);
      const dirty = allKeys.filter((key) => manager.getState(key).dirty);
      if (!dirty.length) {
        const results = await manager.loadStores(allKeys);
        const failure = results.find((result) => result.error);
        if (failure) throw failure.error;
        await refreshCurrentPhase?.();
        showToast('Dados compartilhados atualizados.', 'success');
        return true;
      }
      const results = await manager.syncStores(dirty);
      const failure = results.find((result) => result.error);
      if (failure?.error instanceof SyncConflictError) return openConflict(failure.error);
      if (failure?.error instanceof SyncLockError) {
        setReadonly(getCurrentPhase(), [{ key: failure.key, lock: failure.error.lock }]);
        return false;
      }
      if (failure?.error instanceof SyncOwnLockError) {
        setReadonly(getCurrentPhase(), [{ key: failure.key, lock: failure.error.lock }]);
        return false;
      }
      if (failure) throw failure.error;
      showToast('Alteracoes sincronizadas com a pasta compartilhada.', 'success');
      return true;
    } catch (error) {
      console.error('[shared-sync] Falha ao sincronizar.', error);
      showOfflineNotice();
      return false;
    }
  }

  async function enterPhase(phase) {
    const nextKeys = syncKeysForPhase(phase);
    const leaving = currentKeys.filter((key) => !nextKeys.includes(key));
    await manager.releaseLocks(leaving);
    clearReadonly();
    currentKeys = nextKeys;
    if (!configured || !nextKeys.length) return;
    const locks = [];
    for (const key of nextKeys) {
      try {
        const lock = await manager.acquireLock(key);
        if (lock?.ownedByCurrentUser) locks.push({ key, lock });
      } catch (error) {
        if (error instanceof SyncLockError || error instanceof SyncOwnLockError) locks.push({ key, lock: error.lock });
        else showOfflineNotice();
      }
    }
    if (locks.length) setReadonly(phase, locks);
  }

  async function initialize({ subscribeToIdbChanges } = {}) {
    popover = createPopover();
    unsubscribeState = manager.subscribe(handleManagerState);
    unsubscribeIdb = subscribeToIdbChanges?.((storeNames) => {
      storeNames.forEach((storeName) => void manager.markDirtyByStoreName(storeName));
    });
    document.addEventListener('click', blockReadonlyWrites, true);
    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handlePopoverKeydown);
    globalThis.addEventListener?.('resize', positionPopover);
    globalThis.addEventListener?.('scroll', closePopover, true);
    button()?.addEventListener('click', togglePopover);
    button()?.setAttribute('aria-expanded', 'false');
    button()?.setAttribute('aria-controls', 'shared-sync-popover');
    statusTimer = globalThis.setInterval?.(handleManagerState, 30_000) || null;
    const handle = await adapter.restoreDirectory();
    configured = Boolean(handle);
    directoryName = handle?.name || '';
    renderStatus();
    if (!handle) return { configured: false };
    try {
      if (await adapter.queryPermission() !== 'granted') return { configured: true, permissionRequired: true };
      const results = await manager.loadStores();
      if (results.some((result) => result.error)) showOfflineNotice();
      return { configured: true, results };
    } catch (error) {
      showOfflineNotice();
      return { configured: true, error };
    }
  }

  function dispose() {
    unsubscribeState?.();
    unsubscribeIdb?.();
    document.removeEventListener('click', blockReadonlyWrites, true);
    document.removeEventListener('pointerdown', handleOutsidePointer);
    document.removeEventListener('keydown', handlePopoverKeydown);
    globalThis.removeEventListener?.('resize', positionPopover);
    globalThis.removeEventListener?.('scroll', closePopover, true);
    button()?.removeEventListener('click', togglePopover);
    if (statusTimer !== null) globalThis.clearInterval?.(statusTimer);
    popover?.remove();
    popover = null;
    clearReadonly();
    manager.dispose();
  }

  return {
    initialize,
    enterPhase,
    syncNow,
    reconnect,
    connectOrChangeFolder,
    renderStatus,
    isConfigured: () => configured,
    dispose,
  };
}
