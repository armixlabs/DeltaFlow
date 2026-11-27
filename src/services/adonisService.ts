
import { getEnvVar, getRequiredEnvVar } from '../utils/env';
import type { Model, ModelGroup, GroupContent, AdonisModelGroupResponse, AdonisRawModel, AdonisRawSubgroup } from '../types';
import { generateAuthHeaders } from './auth';
import { resolveAdonisApiOrigin } from './adonisApiConfig';

const ADO_REST_IDENTIFIER = getEnvVar('ADO_REST_IDENTIFIER');
const ADO_REST_SECRET = getEnvVar('ADO_REST_SECRET');
const ADO_REST_REPO = getRequiredEnvVar('ADO_REST_REPO');

const API_ORIGIN = resolveAdonisApiOrigin();
console.info('[ADONIS Service] Using API origin:', API_ORIGIN);

const API_BASE_URL_V4 = `${API_ORIGIN}/rest/4.0/repos/${ADO_REST_REPO}`;
const API_BASE_URL_V2_1 = `${API_ORIGIN}/rest/2.1/repos/${ADO_REST_REPO}`;

// Helper to ensure an ID is wrapped in curly braces, as required by the ADONIS API.
const ensureBracedGuid = (id: string): string => {
  const trimmedId = id.trim();
  if (trimmedId.startsWith('{') && trimmedId.endsWith('}')) {
    return trimmedId;
  }
  return `{${trimmedId}}`;
};

// A generic fetch wrapper to handle authentication and errors
async function adonisFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Do not send auth headers if credentials are not fully provided
  const useAuth = !!(ADO_REST_IDENTIFIER && ADO_REST_SECRET);
  const authHeaders = useAuth ? await generateAuthHeaders(ADO_REST_IDENTIFIER, ADO_REST_SECRET) : {};
  
  // Log the URL being fetched for debugging
  console.log('[ADONIS Service] Fetching URL:', url);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...authHeaders,
      },
    });
  } catch (error) {
    console.error('[ADONIS Service] Network error while calling', url, error);
    throw error;
  }

  if (!response.ok) {
    // Log detailed error information
    const errorBody = await response.text();
    console.error(`[ADONIS Service] API Error for URL: ${url}`);
    console.error(`[ADONIS Service] Status: ${response.status} ${response.statusText}`);
    console.error('[ADONIS Service] Response Body:', errorBody);
    throw new Error(`Failed to fetch from ADONIS API: ${response.statusText}`);
  }

  console.log('[ADONIS Service] Response OK', {
    url,
    status: response.status,
    contentType: response.headers.get('content-type'),
  });

  return response;
}


/**
 * Fetches the subgroups and models for a given model group ID.
 * @param groupId The ID of the model group.
 * @returns A promise that resolves to the content of the group.
 */
export const getGroupContents = async (groupId: string): Promise<GroupContent> => {
  const url = `${API_BASE_URL_V4}/modelgroups/${ensureBracedGuid(groupId)}`;
  const response = await adonisFetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  const data: AdonisModelGroupResponse = await response.json();

  const subgroups: ModelGroup[] = (data.group.subgroups || []).map((sg: AdonisRawSubgroup) => ({
    id: sg.id,
    name: sg.name,
  }));

  const models: Model[] = (data.group.models || [])
    .filter((model: AdonisRawModel) => model.metaName === "MT_BUSINESS_PROCESS_DIAGRAM_BPMN_20")
    .map((model: AdonisRawModel) => ({
      id: model.id,
      name: model.name,
      type: model.type,
      state: model.rwf.state,
      parentGroupId: groupId,
    }));

  console.log('[ADONIS Service] Group contents loaded', {
    groupId,
    subgroups: subgroups.length,
    models: models.length,
  });

  return { subgroups, models };
};


/**
 * Fetches the BPMN 2.0 XML for a given model ID.
 * @param modelId The ID of the model.
 * @returns A promise that resolves to the BPMN XML string.
 */
export const getModelXml = async (modelId: string): Promise<string> => {
  const url = `${API_BASE_URL_V2_1}/models/${ensureBracedGuid(modelId)}`;
  const response = await adonisFetch(url, {
    headers: { 'Accept': 'application/bpmn+xml' },
  });
  return response.text();
};
