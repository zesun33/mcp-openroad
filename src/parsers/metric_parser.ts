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

export interface CtsSummary {
  buffers?: number;
  nets?: number;
}

/**
 * Parses CTS result lines: "Created N clock buffers." / "Created N clock nets."
 */
export function parseCtsSummary(stdout: string): CtsSummary {
  let buffers: number | undefined;
  let nets: number | undefined;

  for (const line of stdout.split('\n')) {
    const b = line.match(/Created\s+(\d+)\s+clock buffers?\./i);
    if (b) buffers = parseInt(b[1], 10);
    const n = line.match(/Created\s+(\d+)\s+clock nets?\./i);
    if (n) nets = parseInt(n[1], 10);
  }

  return { buffers, nets };
}

export interface DrcSummary {
  count: number;
  samples: string[];
}

/**
 * Counts detailed-route DRC markers ([ERROR DRT-...], "No access point").
 * Samples are capped for token safety.
 */
export function parseDrcIssues(stdout: string, maxSamples: number = 10): DrcSummary {
  const samples: string[] = [];
  let count = 0;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (/^\[ERROR\s+DRT-/i.test(trimmed) || /No access point for/i.test(trimmed)) {
      count += 1;
      if (samples.length < Math.max(1, maxSamples)) samples.push(trimmed.slice(0, 200));
    }
  }

  return { count, samples };
}

export interface PowerReport {
  totalW?: number;
  internalW?: number;
  switchingW?: number;
  leakageW?: number;
  breakdown?: Record<string, number>;
}

/**
 * Parses OpenSTA `report_power` output: per-group rows plus the Total row
 * (Internal / Switching / Leakage / Total watts).
 */
export function parsePowerReport(stdout: string): PowerReport {
  let totalW: number | undefined;
  let internalW: number | undefined;
  let switchingW: number | undefined;
  let leakageW: number | undefined;
  const breakdown: Record<string, number> = {};

  for (const line of stdout.split('\n')) {
    const total = line.match(/^Total\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (total) {
      internalW = parseFloat(total[1]);
      switchingW = parseFloat(total[2]);
      leakageW = parseFloat(total[3]);
      totalW = parseFloat(total[4]);
      continue;
    }
    const group = line.match(/^(Sequential|Combinational|Clock|Macro|Pad)\s+\S+\s+\S+\s+\S+\s+(\S+)/);
    if (group) {
      const v = parseFloat(group[2]);
      if (!Number.isNaN(v)) breakdown[group[1].toLowerCase()] = v;
    }
  }

  const clean = (v: number | undefined) => (v !== undefined && !Number.isNaN(v) ? v : undefined);
  const result: PowerReport = {
    totalW: clean(totalW),
    internalW: clean(internalW),
    switchingW: clean(switchingW),
    leakageW: clean(leakageW),
  };
  if (Object.keys(breakdown).length > 0) result.breakdown = breakdown;
  return result;
}

/**
 * Counts routed wire segments (`+ ROUTED` continuations) in DEF text.
 * Zero with a successful TritonRoute run means nothing was actually
 * routed (e.g. pin-access failures on CTS buffers) — reported, not hidden.
 */
export function countRoutedWires(defText: string): number {
  let count = 0;
  for (const line of defText.split('\n')) {
    if (/^\s*\+\s+ROUTED\b/.test(line)) count += 1;
  }
  return count;
}

/** Signal-net `+ ROUTED` only (ignores SPECIALNETS power stripes). */
export function countSignalRoutedWires(defText: string): number {
  const match = defText.match(/\nNETS\s+\d+\s*;([\s\S]*?)\nEND NETS/);
  if (!match) return 0;
  let count = 0;
  for (const line of match[1].split('\n')) {
    if (/^\s*\+\s+ROUTED\b/.test(line)) count += 1;
  }
  return count;
}
