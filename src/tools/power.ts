import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { resolvePlatformPaths, generatePowerTcl } from '../flow/generator.js';
import { parseOpenRoadOutput, parsePowerReport } from '../parsers/metric_parser.js';
import { PowerResult } from '../parsers/types.js';

export const openroadPowerSchema = z.object({
  def_file: z.string().describe('DEF file path (placed or routed)'),
  top_module: z.string().describe('Name of the top-level module'),
  sdc_file: z.string().optional().describe('Optional SDC timing constraints file path'),
  clock_period_ns: z.number().optional().default(1.0).describe('Target clock period in ns if no SDC provided (default: 1.0)'),
  platform: z.enum(['nangate45', 'sky130']).optional().default('nangate45').describe("Process platform (default: 'nangate45'). 'sky130' needs MCP_OPENROAD_PDK_ROOT."),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(60000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadPower(
  runner: ToolRunner,
  args: z.infer<typeof openroadPowerSchema>
) {
  const defaultPlatform = resolvePlatformPaths(runner, args.platform);

  const tcl = generatePowerTcl(
    {
      defFile: args.def_file,
      topModule: args.top_module,
      sdcFile: args.sdc_file,
      clockPeriodNs: args.clock_period_ns,
    },
    defaultPlatform
  );

  const res = await runner.runTcl(tcl, {
    cwd: args.cwd,
    timeoutMs: args.timeout_ms,
  });

  const metrics = parseOpenRoadOutput(res.stdout, res.stderr);
  const power = parsePowerReport(res.stdout);

  const success = res.exitCode === 0 && res.stdout.includes('POWER_COMPLETE');

  const result: PowerResult = {
    success,
    ...(power.totalW !== undefined ? { totalW: power.totalW } : {}),
    ...(power.internalW !== undefined ? { internalW: power.internalW } : {}),
    ...(power.switchingW !== undefined ? { switchingW: power.switchingW } : {}),
    ...(power.leakageW !== undefined ? { leakageW: power.leakageW } : {}),
    ...(power.breakdown ? { breakdown: power.breakdown } : {}),
    warnings: metrics.warnings.slice(0, 10),
    errors: res.exitCode !== 0 ? [res.stderr.trim() || 'Power analysis failed'] : [],
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
