import { prepareBpmnForOptimization } from '../utils/xml';
import { getRequiredEnvVar } from '../utils/env';
import {
  SYSTEM_INSTRUCTION_CREATE,
  SYSTEM_INSTRUCTION_OPTIMIZE,
  SYSTEM_INSTRUCTION_TRANSCRIPT,
  extractXml,
} from './geminiService';

// Server-side route that forwards to the OpenAI API and attaches the API key (see vite.config.ts).
const OPENAI_PROXY_PATH = '/openai-proxy';
const DEFAULT_MAX_OUTPUT_TOKENS = 20000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIParams {
  messages: ChatMessage[];
  maxOutputTokens?: number;
}

const callOpenAI = async ({ messages, maxOutputTokens }: OpenAIParams): Promise<string> => {
  const response = await fetch(`${OPENAI_PROXY_PATH}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getRequiredEnvVar('OPENAI_MODEL'),
      input: messages,
      max_output_tokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    }),
  });

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch (err) {
      console.error('Failed to read OpenAI error response:', err);
    }
    throw new Error(`OpenAI API error (${response.status} ${response.statusText}): ${errorBody}`);
  }

  const data = await response.json();
  const textSegments: string[] = [];

  const output = data?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type === 'output_text' && typeof part.text === 'string') {
            textSegments.push(part.text);
          }
        }
      }
    }
  }

  const content = textSegments.join('').trim();
  if (!content) {
    throw new Error('OpenAI response did not contain any content.');
  }
  return content;
};

export const createBPMNWithOpenAI = async (userPrompt: string): Promise<string> => {
  const trimmedPrompt = userPrompt.trim();
  try {
    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION_CREATE },
        { role: 'user', content: trimmedPrompt },
      ],
    });

    return extractXml(raw);
  } catch (error) {
    console.error('OpenAI creation error:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};

export const createBPMNFromTranscriptWithOpenAI = async (transcript: string): Promise<string> => {
  const trimmed = transcript.trim();
  try {
    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION_TRANSCRIPT },
        { role: 'user', content: trimmed },
      ],
    });

    return extractXml(raw);
  } catch (error) {
    console.error('OpenAI transcript creation error:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};

export const optimizeBPMNWithOpenAI = async (bpmnXml: string, userPrompt: string): Promise<string> => {
  const normalizedXml = prepareBpmnForOptimization(bpmnXml);
  const instruction = userPrompt.trim();

  const prompt = `Here is an existing BPMN 2.0 XML document inside the <bpmn_xml> wrapper. The <bpmndi:BPMNDiagram> layout information was removed to reduce payload size. Improve the process according to the request and return only the optimized BPMN XML including a refreshed <bpmndi:BPMNDiagram>.
<bpmn_xml>
${normalizedXml}
</bpmn_xml>
Optimization request:
${instruction}`;

  try {
    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION_OPTIMIZE },
        { role: 'user', content: prompt },
      ],
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    });

    return extractXml(raw);
  } catch (error) {
    console.error('OpenAI optimization error:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};
