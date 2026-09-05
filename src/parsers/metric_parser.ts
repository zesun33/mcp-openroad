import { BoundingBox } from './types.js';

export interface ExtractedMetrics {
  cellCount?: number;
  utilization?: number;
  hpwl?: number;
  pinsPlaced?: number;
  totalDisplacement?: number;
  maxDisplacement?: number;
  dieArea?: BoundingBox;
  coreArea?: BoundingBox;
  warnings: string[];
  errors: string[];
}

export function parseOpenRoadOutput(stdout: string, stderr: string): ExtractedMetrics {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split('\n');

  let cellCount: number | undefined;
  let utilization: number | undefined;
  let hpwl: number | undefined;
  let pinsPlaced: number | undefined;
  let totalDisplacement: number | undefined;
  let maxDisplacement: number | undefined;

  let dbu = 2000;
  let dieLx = 0, dieLy = 0, dieUx = 0, dieUy = 0;
  let coreLx = 0, coreLy = 0, coreUx = 0, coreUy = 0;
  let hasDie = false;
  let hasCore = false;

  const warnings: string[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Warnings and errors
    if (trimmed.startsWith('[WARNING')) {
      warnings.push(trimmed);
    } else if (trimmed.startsWith('[ERROR')) {
      errors.push(trimmed);
    }

    // Number of instances
    const instMatch = trimmed.match(/NumInstances:\s+(\d+)/);
    if (instMatch) {
      cellCount = parseInt(instMatch[1], 10);
    }

    // Utilization
    const utilMatch = trimmed.match(/Util\(%\):\s+([\d.]+)/);
    if (utilMatch) {
      utilization = parseFloat(utilMatch[1]);
    }

    // HPWL
    const hpwlMatch = trimmed.match(/legalized HPWL\s+([\d.]+)\s*u/i);
    if (hpwlMatch) {
      hpwl = parseFloat(hpwlMatch[1]);
    } else if (!hpwl) {
      const gplHpwl = trimmed.match(/original HPWL\s+([\d.]+)\s*u/i);
      if (gplHpwl) hpwl = parseFloat(gplHpwl[1]);
    }

    // Pins placed
    const pinMatch = trimmed.match(/Number of I\/O\s+(\d+)/);
    if (pinMatch) {
      pinsPlaced = parseInt(pinMatch[1], 10);
    }

    // Displacements
    const totDisp = trimmed.match(/total displacement\s+([\d.]+)\s*u/i);
    if (totDisp) totalDisplacement = parseFloat(totDisp[1]);

    const maxDisp = trimmed.match(/max displacement\s+([\d.]+)\s*u/i);
    if (maxDisp) maxDisplacement = parseFloat(maxDisp[1]);

    // DBU
    const dbuMatch = trimmed.match(/DBU:\s+(\d+)/);
    if (dbuMatch) dbu = parseInt(dbuMatch[1], 10);

    // Die Area
    const dieLxLy = trimmed.match(/DieAreaLxLy:\s+(\d+)\s+(\d+)/);
    if (dieLxLy) {
      dieLx = parseInt(dieLxLy[1], 10);
      dieLy = parseInt(dieLxLy[2], 10);
      hasDie = true;
    }
    const dieUxUy = trimmed.match(/DieAreaUxUy:\s+(\d+)\s+(\d+)/);
    if (dieUxUy) {
      dieUx = parseInt(dieUxUy[1], 10);
      dieUy = parseInt(dieUxUy[2], 10);
      hasDie = true;
    }

    // Core Area
    const coreLxLy = trimmed.match(/CoreAreaLxLy:\s+(\d+)\s+(\d+)/);
    if (coreLxLy) {
      coreLx = parseInt(coreLxLy[1], 10);
      coreLy = parseInt(coreLxLy[2], 10);
      hasCore = true;
    }
    const coreUxUy = trimmed.match(/CoreAreaUxUy:\s+(\d+)\s+(\d+)/);
    if (coreUxUy) {
      coreUx = parseInt(coreUxUy[1], 10);
      coreUy = parseInt(coreUxUy[2], 10);
      hasCore = true;
    }
  }

  let dieArea: BoundingBox | undefined;
  if (hasDie && dbu > 0) {
    dieArea = {
      llx: dieLx / dbu,
      lly: dieLy / dbu,
      urx: dieUx / dbu,
      ury: dieUy / dbu,
      width: (dieUx - dieLx) / dbu,
      height: (dieUy - dieLy) / dbu,
    };
  }

  let coreArea: BoundingBox | undefined;
  if (hasCore && dbu > 0) {
    coreArea = {
      llx: coreLx / dbu,
      lly: coreLy / dbu,
      urx: coreUx / dbu,
      ury: coreUy / dbu,
      width: (coreUx - coreLx) / dbu,
      height: (coreUy - coreLy) / dbu,
    };
  }

  return {
    cellCount,
    utilization,
    hpwl,
    pinsPlaced,
    totalDisplacement,
    maxDisplacement,
    dieArea,
    coreArea,
    warnings,
    errors,
  };
}
