import { getEnvVar } from './env';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'anthropic-haiku';

const PROVIDERS: Record<ModelProvider, { vendor: string; modelKey: string }> = {
  gemini: { vendor: 'Google', modelKey: 'GEMINI_MODEL' },
  openai: { vendor: 'OpenAI', modelKey: 'OPENAI_MODEL' },
  anthropic: { vendor: 'Anthropic', modelKey: 'ANTHROPIC_MODEL' },
  'anthropic-haiku': { vendor: 'Anthropic', modelKey: 'ANTHROPIC_HAIKU_MODEL' },
};

export const MODEL_PROVIDERS = Object.keys(PROVIDERS) as ModelProvider[];

// Name of the setting that holds the provider's model ID.
export const getProviderModelKey = (provider: ModelProvider): string => PROVIDERS[provider].modelKey;

// The model behind each provider is configurable, so the label shows the configured model ID.
export const getProviderLabel = (provider: ModelProvider): string => {
  const { vendor, modelKey } = PROVIDERS[provider];
  const model = getEnvVar(modelKey);
  return model ? `${vendor} ${model}` : `${vendor} (model not configured)`;
};
