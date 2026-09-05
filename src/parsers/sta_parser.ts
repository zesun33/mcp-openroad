import { CriticalPath, TimingMetrics } from './types.js';

export interface ParsedTimingReport {
  timing: TimingMetrics;
  criticalPaths: CriticalPath[];
}

export function parseOpenStaReport(reportText: string): ParsedTimingReport {
  let wns = 0.0;
  let tns = 0.0;
  let hasWns = false;
  let worstSlack: number | undefined;

  // Extract wns and tns
  const wnsMatch = reportText.match(/\bwns\s+(-?[\d.]+)/i);
  if (wnsMatch) {
    wns = parseFloat(wnsMatch[1]);
    hasWns = true;
  }

  const tnsMatch = reportText.match(/\btns\s+(-?[\d.]+)/i);
  if (tnsMatch) {
    tns = parseFloat(tnsMatch[1]);
  }

  const worstSlackMatch = reportText.match(/\bworst slack\s+(-?[\d.]+)/i);
  if (worstSlackMatch) {
    worstSlack = parseFloat(worstSlackMatch[1]);
    if (!hasWns) {
      wns = worstSlack < 0 ? worstSlack : 0.0;
    }
  }

  // Parse path blocks
  const criticalPaths: CriticalPath[] = [];
  const pathBlocks = reportText.split(/Startpoint:\s+/);

  for (let i = 1; i < pathBlocks.length; i++) {
    const block = pathBlocks[i];
    const lines = block.split('\n');
    const startpoint = lines[0]?.trim() || 'unknown';

    let endpoint = 'unknown';
    let pathGroup: string | undefined;
    let pathType: string | undefined;
    let slack: number | undefined;

    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed.startsWith('Endpoint:')) {
        endpoint = trimmed.replace('Endpoint:', '').trim();
      } else if (trimmed.startsWith('Path Group:')) {
        pathGroup = trimmed.replace('Path Group:', '').trim();
      } else if (trimmed.startsWith('Path Type:')) {
        pathType = trimmed.replace('Path Type:', '').trim();
      } else if (trimmed.includes('slack (')) {
        const slackMatch = trimmed.match(/(-?[\d.]+)\s+slack\s*\((MET|VIOLATED)\)/i);
        if (slackMatch) {
          slack = parseFloat(slackMatch[1]);
        }
      }
    }

    if (slack !== undefined) {
      criticalPaths.push({
        startpoint,
        endpoint,
        slack,
        pathGroup,
        pathType,
      });
    }
  }

  const timingMet = wns >= 0 && (worstSlack === undefined || worstSlack >= 0);

  return {
    timing: {
      timingMet,
      wns,
      tns,
    },
    criticalPaths,
  };
}
