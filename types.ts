
export interface ModelGroup {
  id: string; // e.g., "{guid}"
  name: string;
}

export interface Model {
  id: string; // e.g., "{guid}"
  name: string;
  type: string;
  state: string;
}

// Type for the content of a group
export interface GroupContent {
  subgroups: ModelGroup[];
  models: Model[];
}


// --- Raw API Response Types ---
interface AdonisRestLink {
  href: string;
  method: string;
  rel: string;
}

interface AdonisRwf {
    state: string;
    stableLink: { href: string };
    icon: { groupName: string; key: string };
}

export interface AdonisRawSubgroup {
  rest_links: AdonisRestLink[];
  id: string; 
  name: string;
}

export interface AdonisRawModel {
  rest_links: AdonisRestLink[];
  rwf: AdonisRwf;
  id: string; 
  libraryObjectId: string;
  name: string;
  type: string;
  metaName: string;
}

export interface AdonisModelGroupResponse {
  locale: string;
  group: {
    rest_links: AdonisRestLink[];
    id: string;
    name: string;
    subgroups?: AdonisRawSubgroup[];
    models?: AdonisRawModel[];
  };
}