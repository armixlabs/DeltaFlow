import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseCycleMessagesOptions {
  intervalMs?: number;
}

export const useCycleMessages = (
  messages: readonly string[],
  options: UseCycleMessagesOptions = {}
) => {
  const { intervalMs = 4_000 } = options;
  const intervalRef = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const safeMessages = useMemo(() => (messages.length > 0 ? messages : ['']), [messages]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsActive(false);
  }, []);

  const start = useCallback(() => {
    if (safeMessages.length === 0) {
      return;
    }
    stop();
    setIndex(0);
    setIsActive(true);
    intervalRef.current = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % safeMessages.length);
    }, intervalMs);
  }, [intervalMs, safeMessages.length, stop]);

  useEffect(() => stop, [stop]);

  return {
    currentMessage: safeMessages[index] ?? '',
    isActive,
    start,
    stop,
  };
};
