import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { getDefaultPlatformPaths, generateFloorplanTcl } from '../flow/generator.js';
import { parseOpenRoadOutput } from '../parsers/metric_parser.js';
import { FloorplanResult } from '../parsers/types.js';

export const openroadFloorplanSchema = z.object({
  netlist_file: z.string().describe('Gate-level Verilog netlist file path'),
  top_module: z.string().describe('Name of the top-level module'),
  die_width: z.number().optional().default(60).describe('Die width in microns (default: 60)'),
  die_height: z.number().optional().default(60).describe('Die height in microns (default: 60)'),
  core_margin: z.number().optional().default(5).describe('Margin between die and core in microns (default: 5)'),
  output_def: z.string().optional().describe('Output floorplan DEF file path'),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadFloorplan(
  runner: ToolRunner,
  args: z.infer<typeof openroadFloorplanSchema>
) {
  const defaultPlatform = getDefaultPlatformPaths();
  const outDef = args.output_def || `${args.top_module}_fp.def`;

  const tcl = generateFloorplanTcl(
    {
      netlistFile: args.netlist_file,
      topModule: args.top_module,
      dieWidth: args.die_width,
      dieHeight: args.die_height,
      coreMargin: args.core_margin,
      outputDef: outDef,
    },
    defaultPlatform
  );

  const res = await runner.runTcl(tcl, {
    cwd: args.cwd,
    timeoutMs: args.timeout_ms,
  });

  const metrics = parseOpenRoadOutput(res.stdout, res.stderr);
  const success = res.exitCode === 0 && res.stdout.includes('FLOORPLAN_COMPLETE');

  const dieArea = metrics.dieArea || {
    llx: 0,
    lly: 0,
    urx: args.die_width,
    ury: args.die_height,
    width: args.die_width,
    height: args.die_height,
  };

  const result: FloorplanResult = {
    success,
    dieArea,
    coreArea: metrics.coreArea,
    pinsPlaced: metrics.pinsPlaced,
    defFile: success ? outDef : undefined,
    warnings: metrics.warnings.slice(0, 10),
    errors: res.exitCode !== 0 ? [res.stderr.trim() || 'Floorplanning failed'] : [],
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
