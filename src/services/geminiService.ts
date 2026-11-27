import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import type { GenerateContentParameters } from '@google/genai';
import {
  decodeHtmlEntities,
  isProbablyXml,
  stripUnsupportedExtensions,
  prepareBpmnForOptimization,
} from '../utils/xml';
import { getEnvVar, getRequiredEnvVar } from '../utils/env';

let aiInstance: GoogleGenAI | null = null;

// Server-side route that forwards to the Gemini API and attaches the API key (see vite.config.ts).
const GEMINI_PROXY_PATH = '/gemini-proxy';
// The SDK refuses to run in a browser without a key; the proxy replaces this value with the real one.
const SERVER_MANAGED_API_KEY = 'server-managed';
const DEFAULT_REQUEST_TIMEOUT_MS = 900_000; // 15 minutes to support large diagrams
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

export const SYSTEM_INSTRUCTION_OPTIMIZE = `You are an expert in business process management and BPMN 2.0.
Your task is to optimize a given BPMN 2.0 XML based on a user's request.
You MUST ONLY return the full, valid, optimized BPMN 2.0 XML content.
Do not include any explanations, apologies, or markdown formatting like \`\`\`xml. The output must be pure XML.
Ensure all elements in the original diagram are either present, modified, or logically replaced in the optimized version.
Preserve diagram information (BPMNDiagram) if possible, but regenerate it if necessary to ensure it's valid for the new process flow.`;

export const SYSTEM_INSTRUCTION_CREATE = `You are an expert in business process management and BPMN 2.0.
Your task is to create a new BPMN 2.0 process model from a user's natural language description.

Key Requirements:
1. Use a Pool and infer a concise and relevant name for the process from the user's description.
2. Identify roles or actors and create a swimlane (Lane) for each inside the Pool.
3. Place tasks, events, and gateways in the swimlane of the responsible role.
4. Produce a complete BPMN 2.0 file, including both the semantic process definition (<bpmn:process>) and the visual layout information (<bpmndi:BPMNDiagram>).
5. Output only the BPMN XML without additional commentary or markdown fences.`;

export const SYSTEM_INSTRUCTION_TRANSCRIPT = `You are an expert in business process management and BPMN 2.0.
You will be given the transcript of a process modelling meeting. Analyze the discussion to infer the participants, roles, activities, gateways, events, and data they describe. Use that information to produce a BPMN 2.0 process that best reflects the consensus of the meeting.

Key Requirements:
1. Summarize the process described in the transcript into a coherent BPMN diagram. Extract roles/actors from the speakers or mentioned departments and map them to swimlanes.
2. Capture the sequence of activities, decisions, and events as discussed, including parallel or conditional flows that were raised.
3. Where timing or hand-offs were mentioned, model them with appropriate gateways or intermediate events.
4. Produce a complete BPMN 2.0 file, including semantic process definition (<bpmn:process>) and visual layout information (<bpmndi:BPMNDiagram>), so the diagram can be rendered.
5. Output only the BPMN XML without additional commentary or markdown fences.`;

const resolveTimeout = (): number => {
  const envTimeout = getEnvVar('GEMINI_TIMEOUT_MS');

  const parsed = envTimeout ? Number(envTimeout) : undefined;
  if (parsed && Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
};

const getAiClient = (): GoogleGenAI => {
  if (aiInstance) {
    return aiInstance;
  }

  aiInstance = new GoogleGenAI({
    apiKey: SERVER_MANAGED_API_KEY,
    httpOptions: {
      baseUrl: `${window.location.origin}${GEMINI_PROXY_PATH}`,
      timeout: resolveTimeout(),
    },
  });

  return aiInstance;
};

  const wait = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

const shouldRetry = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('deadline') ||
    message.includes('503') ||
    message.includes('unavailable')
  );
};

const runWithRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !shouldRetry(error)) {
        throw error;
      }
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
      await wait(delay);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Failed after retries due to an unknown error.');
};

const chunkToText = (chunk: GenerateContentResponse): string => {
  const directText = (chunk as { text?: string }).text;
  if (typeof directText === 'string') {
    return directText;
  }

  const candidate = chunk.candidates?.[0];
  if (!candidate) {
    return '';
  }

  const parts = candidate.content?.parts ?? [];
  return parts
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('');
};

const collectStreamText = async (
  stream: AsyncGenerator<GenerateContentResponse, any, unknown>,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  let buffer = '';
  for await (const chunk of stream) {
    const piece = chunkToText(chunk);
    if (piece) {
      onChunk?.(piece);
      buffer += piece;
    }
  }
  return buffer.trim();
};

const stripCodeFences = (content: string): string => {
  let output = content.trim();
  if (output.startsWith('```')) {
    output = output.replace(/^```(?:xml)?/i, '');
  }
  if (output.endsWith('```')) {
    output = output.replace(/```$/i, '');
  }
  return output.trim();
};

const searchXmlInValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const decoded = decodeHtmlEntities(value.trim());
    if (isProbablyXml(decoded)) {
      return stripUnsupportedExtensions(decoded);
    }

    const markers = ['<?xml', '<bpmn:definitions', '<definitions'];
    for (const marker of markers) {
      const idx = decoded.indexOf(marker);
      if (idx >= 0) {
        const candidate = stripUnsupportedExtensions(decoded.slice(idx).trim());
        if (isProbablyXml(candidate)) {
          return candidate;
        }
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = searchXmlInValue(item);
      if (result) {
        return result;
      }
    }
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const result = searchXmlInValue((value as Record<string, unknown>)[key]);
      if (result) {
        return result;
      }
    }
  }

  return null;
};

export const extractXml = (content: string): string => {
  const cleaned = stripUnsupportedExtensions(stripCodeFences(content));
  if (isProbablyXml(cleaned)) {
    return cleaned;
  }

  const markers = ['<?xml', '<bpmn:definitions', '<definitions'];
  for (const marker of markers) {
    const markerIndex = cleaned.indexOf(marker);
    if (markerIndex >= 0) {
      const candidate = stripUnsupportedExtensions(cleaned.slice(markerIndex).trim());
      if (isProbablyXml(candidate)) {
        return candidate;
      }
    }
  }

  // Attempt to decode HTML entities that may have been escaped by the model.
  const decoded = stripUnsupportedExtensions(decodeHtmlEntities(cleaned));
  if (decoded !== cleaned) {
    const candidate = searchXmlInValue(decoded);
    if (candidate) {
      return candidate;
    }
  }

  // Attempt to parse JSON wrappers that may contain the XML payload.
  try {
    const parsed = JSON.parse(cleaned);
    const candidate = searchXmlInValue(parsed);
    if (candidate) {
      return candidate;
    }
  } catch {
    // Ignore JSON parse failures; the content wasn't JSON-wrapped.
  }

  console.error('[GeminiService] Unexpected AI response (first 500 chars):', cleaned.slice(0, 500));
  throw new Error('AI response was not in the expected XML format.');
};

interface GenerateContentOptions {
  onChunk?: (chunk: string) => void;
}

const generateContent = async (
  params: GenerateContentParameters,
  options: GenerateContentOptions = {}
): Promise<string> => {
  const ai = getAiClient();
  const stream = await runWithRetry(() => ai.models.generateContentStream(params));
  return collectStreamText(stream, options.onChunk);
};

const OPTIMIZE_GENERATION_CONFIG: GenerateContentParameters['config'] = {
  systemInstruction: SYSTEM_INSTRUCTION_OPTIMIZE,
  temperature: 0.15,
};

const CREATE_GENERATION_CONFIG: GenerateContentParameters['config'] = {
  systemInstruction: SYSTEM_INSTRUCTION_CREATE,
  temperature: 0.3,
};

const CREATE_TRANSCRIPT_GENERATION_CONFIG: GenerateContentParameters['config'] = {
  systemInstruction: SYSTEM_INSTRUCTION_TRANSCRIPT,
  temperature: 0.25,
};

export const createBPMN = async (userPrompt: string): Promise<string> => {
  try {
    const trimmedPrompt = userPrompt.trim();
    const rawResponse = await generateContent({
      model: getRequiredEnvVar('GEMINI_MODEL'),
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: trimmedPrompt,
            },
          ],
        },
      ],
      config: CREATE_GENERATION_CONFIG,
    });

    return extractXml(rawResponse);
  } catch (error) {
    console.error('Error calling Gemini API for creation:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};

export const createBPMNFromTranscript = async (transcript: string): Promise<string> => {
  try {
    const trimmed = transcript.trim();
    const rawResponse = await generateContent({
      model: getRequiredEnvVar('GEMINI_MODEL'),
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: trimmed,
            },
          ],
        },
      ],
      config: CREATE_TRANSCRIPT_GENERATION_CONFIG,
    });

    return extractXml(rawResponse);
  } catch (error) {
    console.error('Error calling Gemini API for transcript-based creation:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};

export const optimizeBPMN = async (bpmnXml: string, userPrompt: string): Promise<string> => {
  const normalizedXml = prepareBpmnForOptimization(bpmnXml);
  const instruction = userPrompt.trim();

  const prompt = `Here is an existing BPMN 2.0 XML document inside the <bpmn_xml> wrapper. The <bpmndi:BPMNDiagram> layout information was removed to reduce payload size. Improve the process according to the request and return only the optimized BPMN XML including a refreshed <bpmndi:BPMNDiagram>.\n<bpmn_xml>\n${normalizedXml}\n</bpmn_xml>\nOptimization request:\n${instruction}`;

  try {
    const startTime = Date.now();
    const metrics = { chunkCount: 0, chunkChars: 0 };
    const rawResponse = await generateContent({
      model: getRequiredEnvVar('GEMINI_MODEL'),
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      config: OPTIMIZE_GENERATION_CONFIG,
    }, {
      onChunk: (chunk) => {
        metrics.chunkCount += 1;
        metrics.chunkChars += chunk.length;
      },
    });

    const finalXml = extractXml(rawResponse);
    const durationMs = Date.now() - startTime;
    const trimmed = finalXml.trim();
    const hasClosingDefinitions = /<\/(bpmn:)?definitions\s*>$/i.test(trimmed.slice(-80));

    console.info('[GeminiService] Optimization metrics', {
      payloadChars: normalizedXml.length,
      chunkCount: metrics.chunkCount,
      streamedChars: metrics.chunkChars,
      rawResponseChars: rawResponse.length,
      finalChars: trimmed.length,
      durationMs,
      hasClosingDefinitions,
    });

    if (!hasClosingDefinitions) {
      console.warn('[GeminiService] Optimized XML missing closing definitions. Last 200 chars:', trimmed.slice(-200));
    }

    return finalXml;
  } catch (error) {
    console.error('Error calling Gemini API for optimization:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};
