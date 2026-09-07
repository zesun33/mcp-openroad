import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { assertDefWritten } from '../def_guard.js';
import { getDefaultPlatformPaths, generateDetailRouteTcl } from '../flow/generator.js';
import { parseOpenRoadOutput, parseDrcIssues, countRoutedWires } from '../parsers/metric_parser.js';
import { DetailRouteResult } from '../parsers/types.js';

export const openroadDetailRouteSchema = z.object({
  routed_def: z.string().describe('Globally-routed DEF file path (output of openroad_route)'),
  top_module: z.string().describe('Name of the top-level module'),
  output_def: z.string().optional().describe('Output detail-routed DEF file path'),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(120000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadDetailRoute(
  runner: ToolRunner,
  args: z.infer<typeof openroadDetailRouteSchema>
) {
  const defaultPlatform = getDefaultPlatformPaths();
  const outDef = args.output_def || `${args.top_module}_droute.def`;

  const tcl = generateDetailRouteTcl(
    {
      routedDef: args.routed_def,
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
  const drc = parseDrcIssues(res.stdout);

  // detailed_route completes (writes DEF) even with DRC/access findings;
  // report them honestly instead of failing the tool.
  const markersOk = res.exitCode === 0 && res.stdout.includes('DETAIL_ROUTE_COMPLETE');
  const missingDef = markersOk ? assertDefWritten(args.cwd, outDef) : null;
  const success = markersOk && missingDef === null;

  // Success means the router executed; routedWires tells whether it
  // actually routed anything (CTS-buffer pin-access failures can yield
  // an unchanged DEF with zero wires — see DRT-0073).
  let routedWires: number | undefined;
  if (success) {
    try {
      const base = path.resolve(args.cwd || process.cwd());
      const abs = path.isAbsolute(outDef) ? outDef : path.join(base, outDef);
      routedWires = countRoutedWires(fs.readFileSync(abs, 'utf-8'));
    } catch {
      routedWires = undefined;
    }
  }
  const warnings = metrics.warnings.slice(0, 10);
  if (success && routedWires === 0) {
    warnings.unshift(
      'Detail route completed but routed 0 wires; check DRC samples for pin-access (DRT-0073) or rerun without prior CTS.'
    );
  }

  const result: DetailRouteResult = {
    success,
    drcIssues: drc.count,
    drcSamples: drc.samples,
    ...(routedWires !== undefined ? { routedWires } : {}),
    defFile: success ? outDef : undefined,
    warnings,
    errors: missingDef ? [missingDef] : res.exitCode !== 0 ? [res.stderr.trim() || 'Detail route execution failed'] : [],
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
