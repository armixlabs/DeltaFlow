import { useCallback, useRef, useState } from 'react';
import { createBPMN } from '../services/geminiService';
import { useCycleMessages } from './useCycleMessages';

type ErrorHandler = (message: string | null) => void;

interface UseProcessCreationOptions {
  messages: readonly string[];
  onError?: ErrorHandler;
  createFn?: (input: string) => Promise<string>;
}

export const useProcessCreation = ({ messages, onError, createFn = createBPMN }: UseProcessCreationOptions) => {
  const [prompt, setPrompt] = useState('');
  const [createdXml, setCreatedXml] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { currentMessage, isActive, start, stop } = useCycleMessages(messages);
  const startTimeRef = useRef<number | null>(null);
  const [lastRunDurationMs, setLastRunDurationMs] = useState<number | null>(null);

  const reset = useCallback(() => {
    setPrompt('');
    setCreatedXml(null);
    setIsCreating(false);
    setLastRunDurationMs(null);
    startTimeRef.current = null;
    stop();
  }, [stop]);

  const runCreation = useCallback(async () => {
    if (!prompt.trim()) {
      onError?.('Please describe the process you want to create.');
      return;
    }

    setIsCreating(true);
    setCreatedXml(null);
    setLastRunDurationMs(null);
    onError?.(null);
    start();
    startTimeRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const newXml = await createFn(prompt);
      setCreatedXml(newXml);
      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (startTimeRef.current != null) {
        setLastRunDurationMs(finishedAt - startTimeRef.current);
      }
    } catch (error) {
      console.error('Process creation failed:', error);
      if (error instanceof Error) {
        onError?.(error.message);
      } else {
        onError?.('An unknown error occurred during creation.');
      }
      setLastRunDurationMs(null);
    } finally {
      stop();
      setIsCreating(false);
      startTimeRef.current = null;
    }
  }, [createFn, onError, prompt, start, stop]);

  return {
    prompt,
    setPrompt,
    createdXml,
    isCreating,
    loadingMessage: currentMessage,
    isLoadingMessageActive: isActive,
    lastRunDurationMs,
    runCreation,
    reset,
  };
};
