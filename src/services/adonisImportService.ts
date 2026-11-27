import { getEnvVar, getRequiredEnvVar } from '../utils/env';
import { generateAuthHeaders } from './auth';
import { stripDocumentation, stripAdonisExtensions, condenseXml, ensureBpmnDi } from '../utils/xml';
import { resolveAdonisApiOrigin } from './adonisApiConfig';

const ADO_REST_IDENTIFIER = getEnvVar('ADO_REST_IDENTIFIER');
const ADO_REST_SECRET = getEnvVar('ADO_REST_SECRET');
const ADO_REST_REPO = getRequiredEnvVar('ADO_REST_REPO');

const API_ORIGIN = resolveAdonisApiOrigin();
const API_BASE_URL_V2_1 = `${API_ORIGIN}/rest/2.1/repos/${ADO_REST_REPO}`;

const normalizeGuid = (id: string): string => {
  const trimmedId = id.trim();
  return trimmedId.replace(/^{|}$/g, '');
};

const ensureXmlDeclaration = (xml: string): string => {
  const trimmed = xml.trim();
  return trimmed.startsWith('<?xml') ? trimmed : `<?xml version="1.0" encoding="UTF-8"?>\n${trimmed}`;
};

const setProcessName = (xml: string, name: string): string => {
  return xml.replace(/<process\b([^>]*)>/i, (match, attrs) => {
    if (/\bname="/.test(attrs)) {
      return match.replace(/name="[^"]*"/, `name="${name}"`);
    }
    return `<process${attrs} name="${name}">`;
  });
};

const preparePayloadXml = (xml: string, processName: string): string => {
  const withoutDocs = stripDocumentation(xml);
  const withoutExtensions = stripAdonisExtensions(withoutDocs);
  const withDi = ensureBpmnDi(withoutExtensions);
  const withName = setProcessName(withDi, processName);
  const condensed = condenseXml(withName);
  return ensureXmlDeclaration(condensed);
};

const sanitizeName = (name: string): string => {
  return name.replace(/[\r\n]/g, ' ').replace(/[\\/:*?"<>|]/g, '-').trim();
};

interface ImportOptions {
  parentModelGroupId: string;
  baseName: string;
}

const adonisImport = async (options: ImportOptions, bpmnXml: string): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

  const name = `${sanitizeName(options.baseName)} ${timestamp}`;

  const payloadXml = preparePayloadXml(bpmnXml, name);

  const normalizedGroupId = normalizeGuid(options.parentModelGroupId);
  const useAuth = !!(ADO_REST_IDENTIFIER && ADO_REST_SECRET);
  const authHeaders = useAuth
    ? await generateAuthHeaders(ADO_REST_IDENTIFIER!, ADO_REST_SECRET!, { type: 'import' })
    : {};

  const url = `${API_BASE_URL_V2_1}/modelgroups/${normalizeGuid(options.parentModelGroupId)}/actions?type=import`;
  const headers = {
    'Content-Type': 'application/bpmn+xml',
    Accept: 'application/json',
    'Accept-Language': 'en',
    api_version: '2.1',
    repo_id: ADO_REST_REPO,
    group_id: normalizedGroupId,
    ...authHeaders,
  };

  console.info('[ADONIS Import] POST', url, headers);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: payloadXml,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to import BPMN: ${response.status} ${response.statusText} - ${errorText}`);
  }
};

export const importOptimizedProcess = async (options: { originalGroupId: string; xml: string; baseName: string }) => {
  await adonisImport(
    {
      parentModelGroupId: options.originalGroupId,
      baseName: options.baseName,
    },
    options.xml
  );
};

export const importCreatedProcess = async (options: { xml: string; baseName: string; parentModelGroupId?: string }) => {
  const groupId = options.parentModelGroupId ?? getRequiredEnvVar('ADO_REST_ROOTMODELGROUP');
  await adonisImport(
    {
      parentModelGroupId: groupId,
      baseName: options.baseName,
    },
    options.xml
  );
};
