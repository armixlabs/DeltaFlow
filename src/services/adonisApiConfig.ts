import { getEnvVar, getRequiredEnvVar } from '../utils/env';

const normalizeBoolean = (value: string | boolean | undefined): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'proxy'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', 'direct'].includes(normalized)) {
    return false;
  }
  return undefined;
};

const ensureLeadingSlash = (value: string): string => {
  return value.startsWith('/') ? value : `/${value}`;
};

export const resolveAdonisApiOrigin = (): string => {
  const explicitBase = getEnvVar('ADONIS_API_BASE');

  if (explicitBase && explicitBase.length > 0) {
    return explicitBase;
  }

  const explicitProxyPath = getEnvVar('ADONIS_PROXY_PATH');
  if (explicitProxyPath && explicitProxyPath.length > 0) {
    return ensureLeadingSlash(explicitProxyPath);
  }

  const proxyFlag = normalizeBoolean(getEnvVar('ADONIS_USE_PROXY'));

  if (proxyFlag !== false) {
    return '/proxy';
  }

  const host = getRequiredEnvVar('ADO_REST_HOST');
  return `https://${host}`;
};
