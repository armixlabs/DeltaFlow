// Helper to convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

/**
 * Generates authentication headers for the ADONIS REST API using Web Crypto API.
 * @param {string} identifier - The identifier for the REST API.
 * @param {string} secret - The secret for the REST API.
 * @returns {Promise<Record<string, string>>} A promise that resolves to an object containing the generated headers.
 */
export async function generateAuthHeaders(
  identifier: string,
  secret: string,
  queryParams: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'x-axw-rest-identifier': identifier,
    'x-axw-rest-guid': crypto.randomUUID(),
    'x-axw-rest-timestamp': Date.now().toString(),
  };

  const restTokenCollection: string[] = [
    ...Object.keys(headers),
    ...Object.values(headers),
    secret,
  ];

  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null) {
      restTokenCollection.push(String(key), String(value));
    }
  }

  restTokenCollection.sort((a, b) => a.localeCompare(b, 'en-US'));
  const sortedString = restTokenCollection.join('');

  const encoder = new TextEncoder();
  const data = encoder.encode(sortedString);
  const keyData = encoder.encode(secret);

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );

  const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, data);
  
  headers["x-axw-rest-token"] = arrayBufferToBase64(signature);
  
  return headers;
}
