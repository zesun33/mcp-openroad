import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ToolRunner } from '../runner.js';
import { assertDefWritten } from '../def_guard.js';
import { resolvePlatformPaths, generatePnrTcl } from '../flow/generator.js';
import { parseOpenRoadOutput, countSignalRoutedWires } from '../parsers/metric_parser.js';
import { parseOpenStaReport } from '../parsers/sta_parser.js';
import { PnrResult } from '../parsers/types.js';

export const openroadPnrSchema = z.object({
  netlist_file: z.string().describe('Gate-level Verilog netlist file path'),
  top_module: z.string().describe('Name of the top-level module to place and route'),
  sdc_file: z.string().optional().describe('Optional SDC timing constraints file'),
  clock_period_ns: z.number().optional().default(1.0).describe('Target clock period in ns if no SDC provided (default: 1.0)'),
  core_utilization: z.number().optional().default(0.7).describe('Target core cell placement density (0.0 - 1.0, default: 0.7)'),
  output_def: z.string().optional().describe('Optional output routed DEF file path'),
  platform: z.enum(['nangate45', 'sky130']).optional().default('nangate45').describe("Process platform (default: 'nangate45'). 'sky130' needs MCP_OPENROAD_PDK_ROOT."),
  detail_route: z.boolean().optional().default(false).describe('Run detailed_route after global routing so the DEF contains real wires (needed for extraction/LVS; default: false)'),
  tapcells: z.boolean().optional().default(false).describe('Insert well-tap/endcap cells after placement (needs a platform with tapcell config, e.g. sky130; default: false)'),
  fillers: z.boolean().optional().default(false).describe('Fill placement gaps with filler/decap cells after routing (needs a platform with filler config; default: false)'),
  pdn: z.boolean().optional().default(false).describe('Insert stdcell PDN (followpins rails + upper straps) after floorplan/tap and before place (Sky130 only; default: false)'),
  cts: z.boolean().optional().default(false).describe('Run clock_tree_synthesis after place/before route (needed at flop-scale; default: false)'),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(60000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadPnr(
  runner: ToolRunner,
  args: z.infer<typeof openroadPnrSchema>
) {
  const defaultPlatform = resolvePlatformPaths(runner, args.platform);
  if (args.tapcells && !defaultPlatform.tapcellMaster) {
    throw new Error(`tapcells requested but platform '${args.platform || 'nangate45'}' defines no tapcell masters.`);
  }
  if (args.fillers && !defaultPlatform.fillerMasters) {
    throw new Error(`fillers requested but platform '${args.platform || 'nangate45'}' defines no filler masters.`);
  }
  if (args.pdn && !defaultPlatform.pdn) {
    throw new Error(`pdn requested but platform '${args.platform || 'nangate45'}' defines no PDN config.`);
  }
  const outDef = args.output_def || `${args.top_module}_routed.def`;

  const tcl = generatePnrTcl(
    {
      netlistFile: args.netlist_file,
      topModule: args.top_module,
      sdcFile: args.sdc_file,
      clockPeriodNs: args.clock_period_ns,
      coreUtilization: args.core_utilization,
      outputDef: outDef,
      detailRoute: args.detail_route,
      tapcells: args.tapcells,
      fillers: args.fillers,
      pdn: args.pdn,
      cts: args.cts,
    },
    defaultPlatform
  );

  const res = await runner.runTcl(tcl, {
    cwd: args.cwd,
    timeoutMs: args.timeout_ms,
  });

  const metrics = parseOpenRoadOutput(res.stdout, res.stderr);
  const sta = parseOpenStaReport(res.stdout);

  const markersOk = res.exitCode === 0 && res.stdout.includes('PNR_COMPLETE');
  const missingDef = markersOk ? assertDefWritten(args.cwd, outDef) : null;
  let success = markersOk && missingDef === null && !res.timedOut;
  const errors: string[] = [];

  let routedWires: number | undefined;
  if (args.detail_route && markersOk && missingDef === null) {
    try {
      const base = path.resolve(args.cwd || process.cwd());
      const abs = path.isAbsolute(outDef) ? outDef : path.join(base, outDef);
      routedWires = countSignalRoutedWires(fs.readFileSync(abs, 'utf-8'));
    } catch {
      routedWires = undefined;
    }
    if (routedWires === 0) {
      success = false;
      errors.push(
        'detailed_route wrote 0 signal wires (DRT-0073 pin-access or GRT produced no guides)'
      );
    }
  }

  const timeoutErr = res.timedOut
    ? `OpenROAD timed out after ${args.timeout_ms} ms (PNR_COMPLETE not reached)`
    : null;
  if (timeoutErr) errors.push(timeoutErr);
  else if (missingDef) errors.push(missingDef);
  else if (res.exitCode !== 0) errors.push(res.stderr.trim() || 'OpenROAD execution failed');

  const result: PnrResult = {
    success,
    topModule: args.top_module,
    platform: args.platform || 'nangate45',
    dieArea: metrics.dieArea,
    coreArea: metrics.coreArea,
    cellCount: metrics.cellCount,
    utilization: metrics.utilization,
    hpwl: metrics.hpwl,
    timing: {
      timingMet: sta.timing.timingMet,
      wns: sta.timing.wns,
      tns: sta.timing.tns,
      clockPeriod: args.clock_period_ns,
    },
    defFile: success ? outDef : undefined,
    timedOut: res.timedOut,
    warnings: metrics.warnings.slice(0, 10),
    errors,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
