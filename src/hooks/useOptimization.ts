import { useCallback, useRef, useState } from 'react';
import { optimizeBPMN } from '../services/geminiService';
import { useCycleMessages } from './useCycleMessages';

type ErrorHandler = (message: string | null) => void;

interface UseOptimizationOptions {
  messages: readonly string[];
  onError?: ErrorHandler;
  optimizeFn?: (bpmnXml: string, prompt: string) => Promise<string>;
}

export const useOptimization = ({ messages, onError, optimizeFn = optimizeBPMN }: UseOptimizationOptions) => {
  const [prompt, setPrompt] = useState('');
  const [optimizedXml, setOptimizedXml] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { currentMessage, isActive, start, stop } = useCycleMessages(messages);
  const startTimeRef = useRef<number | null>(null);
  const [lastRunDurationMs, setLastRunDurationMs] = useState<number | null>(null);

  const reset = useCallback(() => {
    setPrompt('');
    setOptimizedXml(null);
    setIsOptimizing(false);
    setLastRunDurationMs(null);
    startTimeRef.current = null;
    stop();
  }, [stop]);

  const runOptimization = useCallback(
    async (originalXml: string | null) => {
      if (!originalXml) {
        onError?.('No BPMN XML available to optimize. Load a model first.');
        return;
      }

      if (!prompt.trim()) {
        onError?.('Please enter an optimization instruction.');
        return;
      }

      setIsOptimizing(true);
      setOptimizedXml(null);
      setLastRunDurationMs(null);
      onError?.(null);
      start();
      startTimeRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();

      try {
        const newXml = await optimizeFn(originalXml, prompt);
        setOptimizedXml(newXml);
        const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (startTimeRef.current != null) {
          setLastRunDurationMs(finishedAt - startTimeRef.current);
        }
      } catch (error) {
        console.error('Optimization failed:', error);
        if (error instanceof Error) {
          onError?.(error.message);
        } else {
          onError?.('An unknown error occurred during optimization.');
        }
        setLastRunDurationMs(null);
      } finally {
        stop();
        setIsOptimizing(false);
        startTimeRef.current = null;
      }
    },
    [onError, optimizeFn, prompt, start, stop]
  );

  return {
    prompt,
    setPrompt,
    optimizedXml,
    isOptimizing,
    loadingMessage: currentMessage,
    isLoadingMessageActive: isActive,
    lastRunDurationMs,
    runOptimization,
    reset,
  };
};
