// Non-secret settings the server reads from its environment variables and
// injects at build/serve time (see vite.config.ts). Credentials are not part of it.
const getPublicConfig = (): Record<string, string> => {
  if (typeof __DELTAFLOW_CONFIG__ !== 'undefined' && __DELTAFLOW_CONFIG__) {
    return __DELTAFLOW_CONFIG__;
  }
  return {};
};

const OVERRIDES_STORAGE_KEY = 'deltaflow.config.overrides';
let overridesCache: Record<string, string> | null = null;

const loadOverrides = (): Record<string, string> => {
  if (overridesCache) {
    return overridesCache;
  }

  if (typeof window === 'undefined') {
    overridesCache = {};
    return overridesCache;
  }

  try {
    const raw = window.localStorage.getItem(OVERRIDES_STORAGE_KEY);
    overridesCache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch (error) {
    console.warn('[Deltaflow] Failed to parse config overrides from storage.', error);
    overridesCache = {};
  }

  return overridesCache;
};

const persistOverrides = (overrides: Record<string, string>) => {
  if (typeof window === 'undefined') {
    return;
  }
  overridesCache = overrides;
  window.localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
};

export const getConfigOverrides = (): Record<string, string> => {
  return { ...loadOverrides() };
};

export const getConfigOverride = (key: string): string | undefined => {
  const overrides = loadOverrides();
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key];
  }
  return undefined;
};

export const setConfigOverride = (key: string, value: string | undefined) => {
  if (typeof window === 'undefined') {
    return;
  }
  const overrides = loadOverrides();
  if (value && value.length > 0) {
    overrides[key] = value;
  } else {
    delete overrides[key];
  }
  persistOverrides(overrides);
};

export const getEnvVar = (key: string): string | undefined => {
  const override = getConfigOverride(key);
  if (override !== undefined) {
    return override;
  }

  const value = getPublicConfig()[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return undefined;
};

export const getRequiredEnvVar = (key: string): string => {
  const value = getEnvVar(key);
  if (!value) {
    throw new Error(`Environment variable ${key} is required but was not provided.`);
  }
  return value;
};
