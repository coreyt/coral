import { useCallback, useEffect, useMemo, useState } from 'react';
import { createMyIconStore029, type MyIcon029 } from './myIcons029';
export function useMyIcons029() {
  const store = useMemo(() => createMyIconStore029(), []);
  const [icons, setIcons] = useState<MyIcon029[]>([]);
  const [storageError, setStorageError] = useState('');
  const refresh = useCallback(async () => { try { setIcons(await store.list()); setStorageError(''); }
    catch { setStorageError('My Icons could not be stored in this browser. Use an icon in this document or export a bundle.'); } }, [store]);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = async (entries: MyIcon029[]) => {
    try { await store.put(entries); await refresh(); return true; }
    catch { setStorageError('My Icons could not be stored. Your preview remains available for document-only use or export.'); return false; }
  };
  const remove = async (id: string) => { try { await store.delete(id); await refresh(); } catch { setStorageError('Could not delete the stored icon.'); } };
  return { icons, storageError, refresh, save, remove };
}
