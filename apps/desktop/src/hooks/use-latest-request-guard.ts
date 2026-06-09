import { useCallback, useMemo, useRef } from 'react';

export function useLatestRequestGuard() {
  const requestIdRef = useRef(0);

  const begin = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  const isCurrent = useCallback((requestId: number) => {
    return requestId === requestIdRef.current;
  }, []);

  return useMemo(() => ({ begin, isCurrent }), [begin, isCurrent]);
}
