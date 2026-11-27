export const condenseXml = (xml: string): string => {
  const trimmed = xml.trim();
  return trimmed.replace(/>\s+</g, '><');
};

export const stripBpmndi = (xml: string): string =>
  xml.replace(/<bpmndi:BPMNDiagram[\s\S]*?<\/bpmndi:BPMNDiagram>/gi, '');

export const stripDocumentation = (xml: string): string =>
  xml.replace(/<documentation[\s\S]*?<\/documentation>/gi, '');

export const stripAdonisExtensions = (xml: string): string =>
  xml
    .replace(/<adonis:attribute[\s\S]*?<\/adonis:attribute>/gi, '')
    .replace(/<adonis:metavalue\s*\/>/gi, '')
    .replace(/<extensionElements[\s\S]*?<\/extensionElements>/gi, '');

export const prepareBpmnForOptimization = (xml: string): string => {
  const withoutDocs = stripDocumentation(xml);
  const withoutAdonis = stripAdonisExtensions(withoutDocs);
  const withoutDi = stripBpmndi(withoutAdonis);
  return condenseXml(withoutDi);
};

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const BPMNDI_NS = 'http://www.omg.org/spec/BPMN/20100524/DI';
const DC_NS = 'http://www.omg.org/spec/DD/20100524/DC';
const DI_NS = 'http://www.omg.org/spec/DD/20100524/DI';

const FLOW_NODE_TAGS = new Set([
  'startEvent',
  'endEvent',
  'task',
  'userTask',
  'serviceTask',
  'scriptTask',
  'manualTask',
  'businessRuleTask',
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
  'eventBasedGateway',
  'subProcess',
]);

const getBoundsForElement = (localName: string) => {
  if (localName.includes('Gateway')) {
    return { width: 60, height: 60 };
  }
  if (localName.endsWith('Event')) {
    return { width: 36, height: 36 };
  }
  return { width: 110, height: 70 };
};

export const ensureBpmnDi = (xml: string): string => {
  if (/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/.test(xml)) {
    return xml;
  }

  try {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
      return xml;
    }

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const doc = parser.parseFromString(xml, 'application/xml');
    const definitions = doc.documentElement;

    if (definitions.getElementsByTagNameNS(BPMNDI_NS, 'BPMNDiagram').length > 0) {
      return xml;
    }

    const processes = Array.from(definitions.getElementsByTagNameNS(BPMN_NS, 'process'));
    if (processes.length === 0) {
      return xml;
    }

    const process = processes[0];
    const processId = process.getAttribute('id') || 'Process_1';

    if (!definitions.getAttribute('xmlns:bpmndi')) {
      definitions.setAttribute('xmlns:bpmndi', BPMNDI_NS);
    }
    if (!definitions.getAttribute('xmlns:omgdc')) {
      definitions.setAttribute('xmlns:omgdc', DC_NS);
    }
    if (!definitions.getAttribute('xmlns:omgdi')) {
      definitions.setAttribute('xmlns:omgdi', DI_NS);
    }

    const diagram = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNDiagram');
    diagram.setAttribute('id', `BPMNDiagram_${processId}`);

    const plane = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNPlane');
    plane.setAttribute('id', `BPMNPlane_${processId}`);
    plane.setAttribute('bpmnElement', processId);
    diagram.appendChild(plane);

    const flowNodes = Array.from(process.children).filter((child) =>
      FLOW_NODE_TAGS.has(child.localName)
    );

    const boundsMap: Record<string, { x: number; y: number; width: number; height: number }> = {};

    flowNodes.forEach((node, index) => {
      const id = node.getAttribute('id');
      if (!id) {
        return;
      }
      const { width, height } = getBoundsForElement(node.localName);
      const x = 150 + index * 180;
      const y = 160;

      boundsMap[id] = { x, y, width, height };

      const shape = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNShape');
      shape.setAttribute('id', `BPMNShape_${id}`);
      shape.setAttribute('bpmnElement', id);

      const bounds = doc.createElementNS(DC_NS, 'omgdc:Bounds');
      bounds.setAttribute('x', String(x));
      bounds.setAttribute('y', String(y));
      bounds.setAttribute('width', String(width));
      bounds.setAttribute('height', String(height));
      shape.appendChild(bounds);
      plane.appendChild(shape);
    });

    const sequenceFlows = Array.from(process.getElementsByTagNameNS(BPMN_NS, 'sequenceFlow'));

    sequenceFlows.forEach((flow) => {
      const id = flow.getAttribute('id');
      const sourceRef = flow.getAttribute('sourceRef');
      const targetRef = flow.getAttribute('targetRef');

      if (!id || !sourceRef || !targetRef) {
        return;
      }

      const sourceBounds = boundsMap[sourceRef];
      const targetBounds = boundsMap[targetRef];
      if (!sourceBounds || !targetBounds) {
        return;
      }

      const edge = doc.createElementNS(BPMNDI_NS, 'bpmndi:BPMNEdge');
      edge.setAttribute('id', `BPMNEdge_${id}`);
      edge.setAttribute('bpmnElement', id);

      const waypoint1 = doc.createElementNS(DI_NS, 'omgdi:waypoint');
      waypoint1.setAttribute('x', String(sourceBounds.x + sourceBounds.width));
      waypoint1.setAttribute('y', String(sourceBounds.y + sourceBounds.height / 2));
      edge.appendChild(waypoint1);

      const waypoint2 = doc.createElementNS(DI_NS, 'omgdi:waypoint');
      waypoint2.setAttribute('x', String(targetBounds.x));
      waypoint2.setAttribute('y', String(targetBounds.y + targetBounds.height / 2));
      edge.appendChild(waypoint2);

      plane.appendChild(edge);
    });

    definitions.appendChild(diagram);

    return serializer.serializeToString(doc);
  } catch (error) {
    console.warn('[Deltaflow] Failed to auto-generate BPMN diagram information.', error);
    return xml;
  }
};

export const isProbablyXml = (content: string): boolean => {
  const normalized = content.trim().toLowerCase();
  return normalized.startsWith('<?xml') || normalized.startsWith('<definitions') || normalized.startsWith('<bpmn:definitions');
};

const htmlEntityMap: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
};

export const decodeHtmlEntities = (value: string): string =>
  value.replace(/&(?:lt|gt|amp|quot|#39);/g, (entity) => htmlEntityMap[entity] ?? entity);

export const stripUnsupportedExtensions = (value: string): string =>
  value
    .replace(/<extensionElements[\s\S]*?<\/extensionElements>/gi, (segment) =>
      /adonis:/i.test(segment) ? '' : segment
    )
    .replace(/<\/adonis:[^>]+>/gi, '');
