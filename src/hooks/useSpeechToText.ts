import { useCallback, useEffect, useRef, useState } from 'react';

type ErrorHandler = (message: string | null) => void;

type TranscriptHandler = (transcript: string) => void;

interface UseSpeechToTextOptions {
  onTranscript: TranscriptHandler;
  onError?: ErrorHandler;
  language?: string;
}

type PunctuationRule = {
  symbol: string;
  variants: string[];
};

const PUNCTUATION_RULES: PunctuationRule[] = [
  { symbol: ',', variants: ['comma', 'komma', 'beistrich'] },
  { symbol: '?', variants: ['question mark', 'questionmark', 'fragezeichen'] },
  { symbol: '.', variants: ['period', 'full stop', 'punkt'] },
  { symbol: '!', variants: ['exclamation mark', 'exclamationmark', 'ausrufezeichen'] },
  { symbol: ';', variants: ['semicolon', 'strichpunkt'] },
  { symbol: ':', variants: ['colon', 'doppelpunkt'] },
  { symbol: '-', variants: ['dash', 'hyphen', 'bindestrich'] },
];

const normalizeSpeechText = (text: string): string => {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  for (const rule of PUNCTUATION_RULES) {
    if (rule.variants.includes(lower)) {
      return rule.symbol;
    }
  }

  let result = trimmed;

  for (const rule of PUNCTUATION_RULES) {
    const pattern = new RegExp(`\\b(${rule.variants.join('|')})\\b`, 'gi');
    result = result.replace(pattern, rule.symbol);
  }

  // Remove spaces before punctuation
  result = result.replace(/\s+([,\.\?!;:\-])/g, '$1');
  // Ensure a trailing space after punctuation if followed by a letter/number without space
  result = result
    .replace(/\s+([,\.!;\-])/g, '$1')
    .replace(/([,\.!;\-])(\S)/g, '$1 $2');

  return result;
};

export const useSpeechToText = ({ onTranscript, onError, language = 'en-US' }: UseSpeechToTextOptions) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptHandlerRef = useRef<TranscriptHandler>(onTranscript);
  const errorHandlerRef = useRef<ErrorHandler | undefined>(onError);

  useEffect(() => {
    transcriptHandlerRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    errorHandlerRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return undefined;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      const normalized = finalTranscript.trim();
      if (normalized) {
        transcriptHandlerRef.current(normalizeSpeechText(normalized));
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (errorHandlerRef.current) {
        errorHandlerRef.current(`Speech recognition error: ${event.error}. Ensure microphone access is allowed.`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      if (errorHandlerRef.current) {
        errorHandlerRef.current('Speech recognition is not supported in this browser.');
      }
      return;
    }
    errorHandlerRef.current?.(null);
    recognitionRef.current.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) {
      return;
    }
    recognitionRef.current.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return {
    isSupported,
    isListening,
    start,
    stop,
    toggle,
  };
};
