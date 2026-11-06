export type ScopeSeverity = 'warning' | 'error' | 'info';
export type ScopeEquipment = Record<string, string | number | boolean | null>;
export type ScopeEquipmentCompatibility = Record<string, string[]>;

export type ScopeServiceClassification = {
  sourceFacts?: string;
  sourceKey: string;
  procedureCodes?: string[];
  manualDescription?: string;
};
export type ScopeSourceItem = {
  technical?: Omit<ScopeServiceClassification, 'sourceKey'> & {
    stale?: boolean;
  };
  classificationFacts?: string;
  key: string;
  kind: string;
  catalogItemId?: string | null;
  description: string;
  quantity: number;
  hours?: number;
};

export type ScopeFamilyDefinition = {
  kind: 'MATERIAL' | 'SERVICE';
  description?: string;
  procedureCodes?: string[];
};

export type ScopeActivityDefinition = {
  id: string;
  text: string;
  auxiliary?: boolean;
  section?: { id: string; title: string; order?: number };
};

export type ScopeRequirement = {
  code: string;
  message: string;
  severity?: ScopeSeverity;
  condition?:
    | 'CLIENT_PENDING'
    | 'COMMERCIAL_DEPENDENCY'
    | 'SAFETY'
    | 'EQUIPMENT';
};

export type ScopeOperationalConditionDefinition = {
  code: string;
  text: string;
  status?: 'PENDING' | 'INCLUDED' | 'EXCLUDED';
};

export type ScopeProcedureDefinition = {
  description?: string;
  category?: string;
  trigger?: 'MATERIAL' | 'SERVICE';
  section: { id: string; title: string; order?: number };
  activities: ScopeActivityDefinition[];
  dependsOnCodes?: string[];
  requiredServiceFamilyCodes?: string[];
  requiredMaterialFamilyCodes?: string[];
  compatibleEquipment?: ScopeEquipmentCompatibility;
  requirements?: ScopeRequirement[];
  operationalConditions?: ScopeOperationalConditionDefinition[];
  requiresOperationalAuthorization?: boolean;
  loadMode?: 'INSTALLATION' | 'LOAD_BANK';
};

export type ScopeFamily = {
  id?: string;
  code: string;
  name: string;
  version?: number;
  isActive?: boolean;
  definitionJson: ScopeFamilyDefinition;
};

export type ScopeProcedure = {
  id?: string;
  code: string;
  name: string;
  version?: number;
  isActive?: boolean;
  definitionJson: ScopeProcedureDefinition;
};

export type ScopeCatalogProfile = {
  id?: string;
  catalogItemId: string;
  familyCodes: string[];
  procedureCodes?: string[];
  includedProcedureCodes?: string[];
  compatibility?: ScopeEquipmentCompatibility;
  isActive?: boolean;
  version?: number;
};

export type EngineInput = {
  proposalType: string;
  equipment?: ScopeEquipment;
  items: ScopeSourceItem[];
  families: ScopeFamily[];
  procedures: ScopeProcedure[];
  profiles: ScopeCatalogProfile[];
};

export type ScopeActivity = {
  id: string;
  text: string;
  procedureCodes: string[];
  sourceKeys: string[];
  auxiliary?: boolean;
};

export type ScopeSection = {
  id: string;
  title: string;
  activities: ScopeActivity[];
};

export type ScopeAlert = {
  code: string;
  severity: ScopeSeverity;
  message: string;
  sourceKeys?: string[];
};

export type ScopeSource = ScopeSourceItem & {
  familyCodes: string[];
  procedureCodes: string[];
};

export type ScopeAppliedProcedure = {
  code: string;
  name: string;
  version: number;
  sourceKeys: string[];
};

export type ScopeOperationalCondition = {
  code: string;
  text: string;
  status: 'PENDING' | 'INCLUDED' | 'EXCLUDED';
  procedureCodes: string[];
  sourceKeys: string[];
};

export type ScopePreview = {
  engineVersion: string;
  sourceHash: string;
  libraryHash: string;
  generatedText: string;
  sections: ScopeSection[];
  alerts: ScopeAlert[];
  sources: ScopeSource[];
  procedures: ScopeAppliedProcedure[];
  operationalConditions: ScopeOperationalCondition[];
};
