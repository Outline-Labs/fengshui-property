export type Coords = {
  lat: number;
  lon: number;
};

export type POICategory =
  | "cemetery"
  | "hospital"
  | "clinic"
  | "park"
  | "water"
  | "religious"
  | "school"
  | "mrt_station"
  | "police_station"
  | "fire_station"
  | "power_station"
  | "industrial";

export type POI = {
  id: string;
  category: POICategory;
  name: string;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

export type HDBBlock = {
  id: string;
  block: string;
  street: string;
  postalCode?: string;
  yearCompleted?: number;
  maxFloorLevel?: number;
  lat: number;
  lon: number;
};

export type OneMapSearchResult = {
  label: string;
  address: string;
  block?: string;
  road?: string;
  building?: string;
  postal?: string;
  lat: number;
  lon: number;
};

export type PropertyType = "hdb" | "condo" | "landed";

export type Property = {
  id: string;
  type: PropertyType;
  name: string;
  address: string;
  postalCode?: string;
  yearCompleted?: number;
  lat: number;
  lon: number;
};

export type FengshuiFactor = {
  type: "positive" | "negative";
  severity: 1 | 2 | 3;
  category: string;
  title: string;
  description: string;
  distanceMeters?: number;
  reference?: string;
};

export type FloorPlanRoom = {
  name: string;
  sector: string;
  note?: string;
};

export type FloorPlanFactor = {
  type: "positive" | "negative";
  severity: 1 | 2 | 3;
  title: string;
  principle: string;
  description: string;
};

export type FloorPlanRecommendation = {
  title: string;
  detail: string;
};

// Summary of the deterministic engine (Flying Stars + Eight Mansions) that
// produces the score — surfaced so the UI can show it's computed, not opined.
export type UnitEngineSummary = {
  period: number;
  group: "东四宅" | "西四宅";
  houseGua: string;
  auspicious: string[]; // 八宅 吉方 directions
  inauspicious: string[]; // 八宅 凶方 directions
};

export type FloorPlanAnalysis = {
  score: number;
  summary: string;
  facing: string;
  rooms: FloorPlanRoom[];
  factors: FloorPlanFactor[];
  recommendations: FloorPlanRecommendation[];
  confidence: "high" | "medium" | "low";
  // Present when the score was computed by the deterministic engine (the LLM
  // then only supplied perception + form-school notes).
  engine?: UnitEngineSummary;
};

export type FormSchoolAnalysis = {
  score: number;
  factors: FengshuiFactor[];
  summary: {
    positives: number;
    negatives: number;
  };
  nearestLandmark?: {
    name: string;
    category: string;
    distanceMeters: number;
  };
  address?: {
    formatted: string;
    block?: string;
    road?: string;
    buildingName?: string;
    postalCode?: string;
  };
};
