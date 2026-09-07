import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { assertDefWritten } from '../def_guard.js';
import { resolvePlatformPaths, generatePdnTcl } from '../flow/generator.js';
import { parseOpenRoadOutput } from '../parsers/metric_parser.js';
import { PdnResult } from '../parsers/types.js';

export const openroadPdnSchema = z.object({
  placed_def: z.string().describe('Placed (and preferably tap-inserted) DEF file path. The step tool still takes a placed DEF; inside openroad_pnr, PDN runs after floorplan/tap and before place.'),
  top_module: z.string().describe('Name of the top-level module'),
  output_def: z.string().optional().describe('Output DEF with PDN straps'),
  platform: z
    .enum(['nangate45', 'sky130'])
    .optional()
    .default('nangate45')
    .describe("Process platform (default: 'nangate45'). PDN is Sky130-only; nangate45 errors honestly."),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(120000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadPdn(
  runner: ToolRunner,
  args: z.infer<typeof openroadPdnSchema>
) {
  const defaultPlatform = resolvePlatformPaths(runner, args.platform);
  if (!defaultPlatform.pdn) {
    throw new Error(
      `pdn requested but platform '${args.platform || 'nangate45'}' defines no PDN config.`
    );
  }
  const outDef = args.output_def || `${args.top_module}_pdn.def`;

  const tcl = generatePdnTcl(
    {
      placedDef: args.placed_def,
      topModule: args.top_module,
      outputDef: outDef,
    },
    defaultPlatform
  );

  const res = await runner.runTcl(tcl, {
    cwd: args.cwd,
    timeoutMs: args.timeout_ms,
  });

  const metrics = parseOpenRoadOutput(res.stdout, res.stderr);
  const markersOk = res.exitCode === 0 && res.stdout.includes('PDN_COMPLETE');
  const missingDef = markersOk ? assertDefWritten(args.cwd, outDef) : null;
  const success = markersOk && missingDef === null;

  const result: PdnResult = {
    success,
    grid: defaultPlatform.pdn.gridName,
    defFile: success ? outDef : undefined,
    warnings: metrics.warnings.slice(0, 10),
    errors: missingDef
      ? [missingDef]
      : res.exitCode !== 0
        ? [res.stderr.trim() || 'PDN generation failed']
        : [],
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
