import { useRef } from 'react';

export function useLatestRequestGuard() {
  const requestIdRef = useRef(0);

  function begin() {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }

  function isCurrent(requestId: number) {
    return requestId === requestIdRef.current;
  }

  return {
    begin,
    isCurrent
  };
}
