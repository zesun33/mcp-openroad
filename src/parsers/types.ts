export interface BoundingBox {
  llx: number;
  lly: number;
  urx: number;
  ury: number;
  width: number;
  height: number;
}

export interface TimingMetrics {
  timingMet: boolean;
  wns: number;
  tns: number;
  clockPeriod?: number;
}

export interface CriticalPath {
  startpoint: string;
  endpoint: string;
  slack: number;
  delay?: number;
  pathGroup?: string;
  pathType?: string;
}

export interface PnrResult {
  success: boolean;
  topModule: string;
  platform: string;
  dieArea?: BoundingBox;
  coreArea?: BoundingBox;
  cellCount?: number;
  utilization?: number;
  hpwl?: number;
  timing: TimingMetrics;
  defFile?: string;
  timedOut?: boolean;
  warnings: string[];
  errors: string[];
}

export interface FloorplanResult {
  success: boolean;
  dieArea?: BoundingBox;
  coreArea?: BoundingBox;
  pinsPlaced?: number;
  defFile?: string;
  warnings: string[];
  errors: string[];
}

export interface PlacementResult {
  success: boolean;
  placedCells?: number;
  hpwl?: number;
  totalDisplacement?: number;
  maxDisplacement?: number;
  defFile?: string;
  warnings: string[];
  errors: string[];
}

export interface RoutingResult {
  success: boolean;
  routedNets?: number;
  totalWirelength?: number;
  drcViolations: number;
  defFile?: string;
  warnings: string[];
  errors: string[];
}

export interface StaResult {
  timingMet: boolean;
  wns: number;
  tns: number;
  clockPeriod?: number;
  criticalPaths: CriticalPath[];
  warnings: string[];
  errors: string[];
}

export interface CtsResult {
  success: boolean;
  clockBuffers?: number;
  clockNets?: number;
  timing: TimingMetrics;
  defFile?: string;
  warnings: string[];
  errors: string[];
}

export interface DetailRouteResult {
  success: boolean;
  drcIssues: number;
  drcSamples: string[];
  routedWires?: number;
  defFile?: string;
  warnings: string[];
  errors: string[];
}

export interface PdnResult {
  success: boolean;
  grid?: string;
  defFile?: string;
  warnings: string[];
  errors: string[];
}

export interface StaCorner {
  corner: string;
  liberty: string;
  wns: number;
  tns: number;
  timingMet: boolean;
}

export interface StaCornersResult {
  success: boolean;
  corners: StaCorner[];
  worstCorner?: string;
  worstWns?: number;
  allMet: boolean;
  warnings: string[];
  errors: string[];
}

export interface PowerResult {
  success: boolean;
  totalW?: number;
  internalW?: number;
  switchingW?: number;
  leakageW?: number;
  breakdown?: Record<string, number>;
  warnings: string[];
  errors: string[];
}

export interface EvalResult {
  success: boolean;
  stdout: string;
  truncated: boolean;
  warnings: string[];
  errors: string[];
}

export interface ToolchainInfo {
  runtime: string;
  image: string;
  openroadVersion: string;
  staVersion: string;
  platforms: string[];
}
