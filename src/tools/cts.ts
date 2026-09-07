import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { assertDefWritten } from '../def_guard.js';
import { resolvePlatformPaths, generateCtsTcl } from '../flow/generator.js';
import { parseOpenRoadOutput, parseCtsSummary } from '../parsers/metric_parser.js';
import { parseOpenStaReport } from '../parsers/sta_parser.js';
import { CtsResult } from '../parsers/types.js';

export const openroadCtsSchema = z.object({
  placed_def: z.string().describe('Placed DEF file path (output of openroad_place)'),
  top_module: z.string().describe('Name of the top-level module'),
  sdc_file: z.string().optional().describe('Optional SDC timing constraints file path'),
  clock_period_ns: z.number().optional().default(1.0).describe('Target clock period in ns if no SDC provided (default: 1.0)'),
  output_def: z.string().optional().describe('Output CTS DEF file path'),
  platform: z.enum(['nangate45', 'sky130']).optional().default('nangate45').describe("Process platform (default: 'nangate45'). 'sky130' needs MCP_OPENROAD_PDK_ROOT."),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(60000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadCts(
  runner: ToolRunner,
  args: z.infer<typeof openroadCtsSchema>
) {
  const defaultPlatform = resolvePlatformPaths(runner, args.platform);
  const outDef = args.output_def || `${args.top_module}_cts.def`;

  const tcl = generateCtsTcl(
    {
      placedDef: args.placed_def,
      topModule: args.top_module,
      sdcFile: args.sdc_file,
      clockPeriodNs: args.clock_period_ns,
      outputDef: outDef,
    },
    defaultPlatform
  );

  const res = await runner.runTcl(tcl, {
    cwd: args.cwd,
    timeoutMs: args.timeout_ms,
  });

  const metrics = parseOpenRoadOutput(res.stdout, res.stderr);
  const cts = parseCtsSummary(res.stdout);
  const sta = parseOpenStaReport(res.stdout);

  const markersOk = res.exitCode === 0 && res.stdout.includes('CTS_COMPLETE');
  const missingDef = markersOk ? assertDefWritten(args.cwd, outDef) : null;
  const success = markersOk && missingDef === null;

  const result: CtsResult = {
    success,
    clockBuffers: cts.buffers,
    clockNets: cts.nets,
    timing: {
      timingMet: sta.timing.timingMet,
      wns: sta.timing.wns,
      tns: sta.timing.tns,
      clockPeriod: args.clock_period_ns,
    },
    defFile: success ? outDef : undefined,
    warnings: metrics.warnings.slice(0, 10),
    errors: missingDef ? [missingDef] : res.exitCode !== 0 ? [res.stderr.trim() || 'CTS execution failed'] : [],
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
