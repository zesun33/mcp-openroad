import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { assertDefWritten } from '../def_guard.js';
import { getDefaultPlatformPaths, generateRouteTcl } from '../flow/generator.js';
import { parseOpenRoadOutput } from '../parsers/metric_parser.js';
import { RoutingResult } from '../parsers/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export const openroadRouteSchema = z.object({
  placed_def: z.string().describe('Placed DEF file path'),
  top_module: z.string().describe('Name of the top-level module'),
  output_def: z.string().optional().describe('Output routed DEF file path'),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadRoute(
  runner: ToolRunner,
  args: z.infer<typeof openroadRouteSchema>
) {
  const defaultPlatform = getDefaultPlatformPaths();
  const outDef = args.output_def || `${args.top_module}_routed.def`;

  const tcl = generateRouteTcl(
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
  const markersOk = res.exitCode === 0 && res.stdout.includes('ROUTE_COMPLETE');
  const missingDef = markersOk ? assertDefWritten(args.cwd, outDef) : null;
  const success = markersOk && missingDef === null;

  // Count DRC violations if any
  const drcMatches = (res.stdout.match(/violation/gi) || []).length;

  const result: RoutingResult = {
    success,
    totalWirelength: metrics.hpwl,
    drcViolations: drcMatches,
    defFile: success ? outDef : undefined,
    warnings: metrics.warnings.slice(0, 10),
    errors: missingDef ? [missingDef] : res.exitCode !== 0 ? [res.stderr.trim() || 'Routing failed'] : [],
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
