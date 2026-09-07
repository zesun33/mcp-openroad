import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { assertDefWritten } from '../def_guard.js';
import { getDefaultPlatformPaths, generatePlacementTcl } from '../flow/generator.js';
import { parseOpenRoadOutput } from '../parsers/metric_parser.js';
import { PlacementResult } from '../parsers/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export const openroadPlaceSchema = z.object({
  floorplan_def: z.string().describe('Floorplan DEF file path'),
  top_module: z.string().describe('Name of the top-level module'),
  density: z.number().optional().default(0.4).describe('Target placement density (default: 0.4)'),
  output_def: z.string().optional().describe('Output placed DEF file path'),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadPlace(
  runner: ToolRunner,
  args: z.infer<typeof openroadPlaceSchema>
) {
  const defaultPlatform = getDefaultPlatformPaths();
  const outDef = args.output_def || `${args.top_module}_placed.def`;

  const tcl = generatePlacementTcl(
    {
      floorplanDef: args.floorplan_def,
      topModule: args.top_module,
      density: args.density,
      outputDef: outDef,
    },
    defaultPlatform
  );

  const res = await runner.runTcl(tcl, {
    cwd: args.cwd,
    timeoutMs: args.timeout_ms,
  });

  const metrics = parseOpenRoadOutput(res.stdout, res.stderr);
  const markersOk = res.exitCode === 0 && res.stdout.includes('PLACEMENT_COMPLETE');
  const missingDef = markersOk ? assertDefWritten(args.cwd, outDef) : null;
  const success = markersOk && missingDef === null;

  const result: PlacementResult = {
    success,
    placedCells: metrics.cellCount,
    hpwl: metrics.hpwl,
    totalDisplacement: metrics.totalDisplacement,
    maxDisplacement: metrics.maxDisplacement,
    defFile: success ? outDef : undefined,
    warnings: metrics.warnings.slice(0, 10),
    errors: missingDef ? [missingDef] : res.exitCode !== 0 ? [res.stderr.trim() || 'Placement failed'] : [],
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
