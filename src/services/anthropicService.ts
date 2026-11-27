import { prepareBpmnForOptimization } from '../utils/xml';
import { getRequiredEnvVar } from '../utils/env';
import {
  SYSTEM_INSTRUCTION_CREATE,
  SYSTEM_INSTRUCTION_OPTIMIZE,
  SYSTEM_INSTRUCTION_TRANSCRIPT,
  extractXml,
} from './geminiService';

// Server-side route that forwards to the Anthropic API and attaches the API key
// and version headers (see vite.config.ts).
const ANTHROPIC_PROXY_PATH = '/anthropic-proxy';
const DEFAULT_MAX_OUTPUT_TOKENS = 20000;
// Setting that holds the model ID; callers can pass another one to use a different Claude model.
const DEFAULT_MODEL_KEY = 'ANTHROPIC_MODEL';

interface AnthropicParams {
  system: string;
  userPrompt: string;
  modelKey: string;
  maxOutputTokens?: number;
}

const callAnthropic = async ({ system, userPrompt, modelKey, maxOutputTokens }: AnthropicParams): Promise<string> => {
  const response = await fetch(`${ANTHROPIC_PROXY_PATH}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getRequiredEnvVar(modelKey),
      system,
      max_tokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: userPrompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch (err) {
      console.error('Failed to read Anthropic error response:', err);
    }
    throw new Error(`Anthropic API error (${response.status} ${response.statusText}): ${errorBody}`);
  }

  const data = await response.json();
  const content = Array.isArray(data?.content)
    ? data.content
        .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
        .map((item: any) => item.text)
        .join('')
        .trim()
    : '';

  if (!content) {
    throw new Error('Anthropic response did not contain any content.');
  }

  return content;
};

export const createBPMNWithAnthropic = async (
  userPrompt: string,
  modelKey: string = DEFAULT_MODEL_KEY
): Promise<string> => {
  try {
    const raw = await callAnthropic({
      system: SYSTEM_INSTRUCTION_CREATE,
      userPrompt: userPrompt.trim(),
      modelKey,
    });

    return extractXml(raw);
  } catch (error) {
    console.error('Anthropic creation error:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};

export const createBPMNFromTranscriptWithAnthropic = async (
  transcript: string,
  modelKey: string = DEFAULT_MODEL_KEY
): Promise<string> => {
  try {
    const raw = await callAnthropic({
      system: SYSTEM_INSTRUCTION_TRANSCRIPT,
      userPrompt: transcript.trim(),
      modelKey,
    });

    return extractXml(raw);
  } catch (error) {
    console.error('Anthropic transcript creation error:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};

export const optimizeBPMNWithAnthropic = async (
  bpmnXml: string,
  userPrompt: string,
  modelKey: string = DEFAULT_MODEL_KEY
): Promise<string> => {
  const optimizedPayload = prepareBpmnForOptimization(bpmnXml);
  const prompt = `Here is an existing BPMN 2.0 XML document inside the <bpmn_xml> wrapper. The <bpmndi:BPMNDiagram> layout information was removed to reduce payload size. Improve the process according to the request and return only the optimized BPMN XML including a refreshed <bpmndi:BPMNDiagram>.
<bpmn_xml>
${optimizedPayload}
</bpmn_xml>
Optimization request:
${userPrompt.trim()}`;

  try {
    const raw = await callAnthropic({
      system: SYSTEM_INSTRUCTION_OPTIMIZE,
      userPrompt: prompt,
      modelKey,
    });

    return extractXml(raw);
  } catch (error) {
    console.error('Anthropic optimization error:', error);
    if (error instanceof Error) {
      throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error('An unknown error occurred while contacting the AI service.');
  }
};
