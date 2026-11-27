import { createHmac, randomUUID } from 'node:crypto';

interface SignAdonisRequestOptions {
  identifier: string;
  secret: string;
  queryParams?: Record<string, string>;
  guid?: string;
  timestamp?: string;
}

/**
 * Server-side counterpart of src/services/auth.ts: generates the signed
 * authentication headers for the ADONIS REST API.
 */
export const signAdonisRequest = ({
  identifier,
  secret,
  queryParams = {},
  guid = randomUUID(),
  timestamp = Date.now().toString(),
}: SignAdonisRequestOptions): Record<string, string> => {
  const headers: Record<string, string> = {
    'x-axw-rest-identifier': identifier,
    'x-axw-rest-guid': guid,
    'x-axw-rest-timestamp': timestamp,
  };

  const restTokenCollection: string[] = [
    ...Object.keys(headers),
    ...Object.values(headers),
    secret,
  ];

  for (const [key, value] of Object.entries(queryParams)) {
    restTokenCollection.push(key, value);
  }

  restTokenCollection.sort((a, b) => a.localeCompare(b, 'en-US'));

  headers['x-axw-rest-token'] = createHmac('sha512', secret)
    .update(restTokenCollection.join(''), 'utf8')
    .digest('base64');

  return headers;
};
