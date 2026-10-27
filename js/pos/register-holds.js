/**
 * Live stock reservation for the POS register ticket.
 *
 * Every product on the open register ticket is reserved in the database
 * (inventory_transactions `park`), so the website and other devices stop
 * selling it immediately. Removing items / clearing the ticket releases them
 * (`park_void`). Before a charge or park, all holds are released and the
 * normal sale / park flow deducts stock exactly once.
 *
 * Holds are persisted per browser tab so a crashed or closed tab gives the
 * stock back the next time the POS opens on this device.
 */
import { applyRegisterHoldChanges, getProductStockLevels } from '../../shared/supabase.js';

const STORAGE_KEY = 'shamaadan_pos_register_holds_v1';
const HEARTBEAT_MS = 30_000;
/** A tab that has not checked in for this long is treated as closed. */
const STALE_MS = 2 * 60_000;
const SYNC_DEBOUNCE_MS = 350;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object') {
      return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { sessions: {} };
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full / private mode — holds still work for this tab */
  }
}

/**
 * @param {Array<{ productId: string, quantity: number }>} lines
 * @returns {Record<string, number>}
 */
function linesToMap(lines) {
  const map = {};
  for (const line of lines || []) {
    const id = String(line?.productId || '').trim();
    const qty = Math.trunc(Number(line?.quantity) || 0);
    if (!id || qty <= 0) continue;
    map[id] = (map[id] || 0) + qty;
  }
  return map;
}

/**
 * @param {{
 *   isEnabled: () => boolean,
 *   onShortage?: (items: Array<{ productId: string, short: number, available: number }>) => void,
 *   onError?: (err: unknown) => void,
 * }} opts
 */
export function createRegisterHolds(opts) {
  const sessionId = newId();
  /** Units currently reserved in the DB by this tab. */
  let held = {};
  /** Units the register ticket currently wants reserved. */
  let desired = {};
  let suspended = false;
  let timer = 0;
  let chain = Promise.resolve();

  function persist() {
    const store = readStore();
    if (Object.keys(held).length) {
      store.sessions[sessionId] = { items: { ...held }, updatedAt: Date.now() };
    } else {
      delete store.sessions[sessionId];
    }
    writeStore(store);
  }

  /**
   * Reserve / release so the DB matches `target` for this tab.
   * @param {Record<string, number>} target
   */
  async function syncTo(target) {
    if (!opts.isEnabled()) return;

    const ids = new Set([...Object.keys(target), ...Object.keys(held)]);
    const changes = [];
    for (const id of ids) {
      const delta = (target[id] || 0) - (held[id] || 0);
      if (delta !== 0) changes.push({ product_id: id, delta });
    }
    if (!changes.length) return;

    const shortages = [];
    const reserves = changes.filter((c) => c.delta > 0);
    if (reserves.length) {
      const levels = await getProductStockLevels(reserves.map((c) => c.product_id));
      for (const change of reserves) {
        const available = levels.get(change.product_id);
        if (!Number.isFinite(available) || available >= change.delta) continue;
        const allowed = Math.max(0, Math.trunc(available));
        shortages.push({ productId: change.product_id, short: change.delta - allowed, available: allowed });
        change.delta = allowed;
      }
    }

    const effective = changes.filter((c) => c.delta !== 0);
    if (effective.length) {
      await applyRegisterHoldChanges(effective, sessionId);
      for (const change of effective) {
        const next = (held[change.product_id] || 0) + change.delta;
        if (next > 0) held[change.product_id] = next;
        else delete held[change.product_id];
      }
      persist();
    }

    if (shortages.length) opts.onShortage?.(shortages);
  }

  function enqueue(target) {
    chain = chain
      .then(() => syncTo(target))
      .catch((err) => {
        opts.onError?.(err);
      });
    return chain;
  }

  /** Call on every register ticket change. */
  function schedule(lines) {
    desired = linesToMap(lines);
    if (suspended) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => enqueue({ ...desired }), SYNC_DEBOUNCE_MS);
  }

  /**
   * Release every hold (before charge / park). Pauses syncing until resume().
   * @returns {Promise<boolean>} true if nothing is left reserved by this tab
   */
  async function releaseAll() {
    suspended = true;
    window.clearTimeout(timer);
    await enqueue({});
    return Object.keys(held).length === 0;
  }

  /** Resume syncing after a charge / park attempt with the current ticket lines. */
  function resume(lines) {
    suspended = false;
    desired = linesToMap(lines);
    window.clearTimeout(timer);
    return enqueue({ ...desired });
  }

  /** Retry after reconnecting. */
  function retry() {
    if (suspended) return chain;
    return enqueue({ ...desired });
  }

  /** Give back stock held by tabs on this device that were closed or crashed. */
  async function releaseStaleSessions() {
    if (!opts.isEnabled()) return;
    const store = readStore();
    const now = Date.now();
    const staleIds = Object.keys(store.sessions).filter((id) => {
      if (id === sessionId) return false;
      const updatedAt = Number(store.sessions[id]?.updatedAt) || 0;
      return now - updatedAt > STALE_MS;
    });

    for (const id of staleIds) {
      const items = store.sessions[id]?.items || {};
      const changes = Object.entries(items)
        .map(([productId, qty]) => ({ product_id: productId, delta: -Math.abs(Math.trunc(Number(qty) || 0)) }))
        .filter((c) => c.delta !== 0);
      try {
        if (changes.length) await applyRegisterHoldChanges(changes, id);
        const latest = readStore();
        delete latest.sessions[id];
        writeStore(latest);
      } catch (err) {
        opts.onError?.(err);
      }
    }
  }

  window.setInterval(() => {
    if (Object.keys(held).length) persist();
  }, HEARTBEAT_MS);

  return {
    schedule,
    releaseAll,
    resume,
    retry,
    releaseStaleSessions,
    hasHolds: () => Object.keys(held).length > 0,
  };
}
