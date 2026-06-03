import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useSyncExternalStore } from 'react';
import { inspectOpenClawStatus } from '../api/stage1-api';
import type { OpenClawPostInstallStatus } from './types';

const OPENCLAW_STATUS_CHANGED_EVENT = 'openclaw://status-changed';

type Listener = () => void;
type OpenClawStatusSnapshot = Readonly<{
  status: OpenClawPostInstallStatus | null;
  loading: boolean;
}>;

const EMPTY_SNAPSHOT: OpenClawStatusSnapshot = {
  status: null,
  loading: false
};

const noopSubscribe = () => () => undefined;
const getEmptySnapshot = () => EMPTY_SNAPSHOT;
const noopRefresh = async () => undefined;

type OpenClawStatusStore = {
  configPath: string;
  snapshot: OpenClawPostInstallStatus | null;
  currentSnapshot: OpenClawStatusSnapshot;
  loading: boolean;
  initialized: boolean;
  listeners: Set<Listener>;
  listeningSupported: boolean;
  unlistenPromise: Promise<UnlistenFn | null> | null;
  ensureStarted: () => void;
  refresh: () => Promise<void>;
  subscribe: (listener: Listener) => () => void;
  notify: () => void;
};

const storeRegistry = new Map<string, OpenClawStatusStore>();

function createStore(configPath: string): OpenClawStatusStore {
  const store: OpenClawStatusStore = {
    configPath,
    snapshot: null,
    currentSnapshot: EMPTY_SNAPSHOT,
    loading: false,
    initialized: false,
    listeners: new Set(),
    listeningSupported: true,
    unlistenPromise: null,
    ensureStarted() {
      if (store.listeningSupported && !store.unlistenPromise) {
        store.unlistenPromise = listen<OpenClawPostInstallStatus>(
          OPENCLAW_STATUS_CHANGED_EVENT,
          (event) => {
            const nextStatus = event.payload;
            if (nextStatus.configPath !== store.configPath) {
              return;
            }

            store.snapshot = nextStatus;
            store.initialized = true;
            store.loading = false;
            syncSnapshotAndNotify(store);
          }
        ).catch((error) => {
          store.unlistenPromise = null;
          store.listeningSupported = false;
          console.warn('OpenClaw status event subscription unavailable, falling back to refresh-only mode.', error);
          return null;
        });
      }

      if (!store.initialized && !store.loading) {
        void store.refresh();
      }
    },
    async refresh() {
      if (!store.loading) {
        store.loading = true;
        syncSnapshotAndNotify(store);
      }

      try {
        store.snapshot = await inspectOpenClawStatus(store.configPath);
        store.initialized = true;
      } finally {
        store.loading = false;
        syncSnapshotAndNotify(store);
      }
    },
    subscribe(listener) {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    notify() {
      store.listeners.forEach((listener) => listener());
    }
  };

  return store;
}

function syncSnapshotAndNotify(store: OpenClawStatusStore) {
  const nextSnapshot =
    store.snapshot === null && !store.loading
      ? EMPTY_SNAPSHOT
      : {
        status: store.snapshot,
        loading: store.loading
      };

  if (
    store.currentSnapshot.status === nextSnapshot.status &&
    store.currentSnapshot.loading === nextSnapshot.loading
  ) {
    return;
  }

  store.currentSnapshot = nextSnapshot;
  store.notify();
}

function getStore(configPath: string) {
  let store = storeRegistry.get(configPath);
  if (!store) {
    store = createStore(configPath);
    storeRegistry.set(configPath, store);
  }
  return store;
}

export function invalidateOpenClawStatus(configPath: string) {
  const store = storeRegistry.get(configPath);
  if (!store) {
    const nextStore = getStore(configPath);
    void nextStore.refresh();
    return;
  }

  void store.refresh();
}

export function useOpenClawStatusSubscription(configPath: string | null | undefined) {
  const store = configPath ? getStore(configPath) : null;

  useEffect(() => {
    if (!store) {
      return;
    }

    store.ensureStarted();
  }, [store]);

  const snapshot = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.currentSnapshot ?? EMPTY_SNAPSHOT,
    getEmptySnapshot
  );

  return {
    status: snapshot.status,
    loading: snapshot.loading,
    refresh: store ? store.refresh : noopRefresh
  };
}
