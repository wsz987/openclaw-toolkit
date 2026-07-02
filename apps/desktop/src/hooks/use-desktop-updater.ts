import { useCallback, useEffect, useRef, useState } from 'react';
import { getName, getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { buildUpdateCheckFailure } from '@/hooks/desktop-update-policy';

const PERIODIC_UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

export type DesktopUpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';

export type DesktopVersionInfo = {
  appName: string;
  appVersion: string;
  tauriVersion: string;
};

export function useDesktopUpdater(enabled = true) {
  const [status, setStatus] = useState<DesktopUpdateStatus>('idle');
  const [versionInfo, setVersionInfo] = useState<DesktopVersionInfo | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadVersionInfo() {
      const [appName, appVersion, tauriVersion] = await Promise.all([
        getName(),
        getVersion(),
        getTauriVersion()
      ]);

      if (!cancelled) {
        setVersionInfo({ appName, appVersion, tauriVersion });
      }
    }

    void loadVersionInfo().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!enabled || checkingRef.current) {
      return null;
    }

    checkingRef.current = true;
    setStatus('checking');
    setError(null);

    try {
      const update = await check();
      const checkedAt = new Date().toISOString();
      setLastCheckedAt(checkedAt);

      if (!update) {
        setAvailableUpdate(null);
        setStatus(manual ? 'not-available' : 'idle');
        return null;
      }

      setAvailableUpdate(update);
      setStatus('available');
      return update;
    } catch (err) {
      const failure = buildUpdateCheckFailure(err, manual);
      console.warn(failure.logMessage, err);
      setAvailableUpdate(null);
      setError(failure.userError);
      setStatus(failure.status);
      return null;
    } finally {
      checkingRef.current = false;
    }
  }, [enabled]);

  const installAvailableUpdate = useCallback(async () => {
    if (!availableUpdate) {
      return;
    }

    setStatus('downloading');
    setError(null);
    setDownloadProgress(0);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await availableUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            setDownloadProgress(0);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setDownloadProgress(contentLength > 0 ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : 0);
            break;
          case 'Finished':
            setDownloadProgress(100);
            break;
        }
      });

      setStatus('ready');
      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [availableUpdate]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const initialTimer = window.setTimeout(() => {
      void checkForUpdates(false);
    }, 5000);

    const periodicTimer = window.setInterval(() => {
      void checkForUpdates(false);
    }, PERIODIC_UPDATE_CHECK_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
    };
  }, [checkForUpdates, enabled]);

  return {
    availableUpdate,
    checkForUpdates,
    downloadProgress,
    error,
    installAvailableUpdate,
    lastCheckedAt,
    status,
    versionInfo
  };
}
