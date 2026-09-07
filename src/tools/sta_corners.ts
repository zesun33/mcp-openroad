import * as path from 'node:path';
import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { getDefaultPlatformPaths, generateStaTcl } from '../flow/generator.js';
import { parseOpenStaReport } from '../parsers/sta_parser.js';
import { StaCornersResult } from '../parsers/types.js';

export const openroadStaCornersSchema = z.object({
  def_file: z.string().describe('DEF file path (placed or routed)'),
  top_module: z.string().describe('Name of the top-level module'),
  liberty_files: z
    .array(z.string())
    .min(1)
    .describe('Liberty (.lib) files, one per corner (e.g. slow/typical/fast). Corner names default to file basenames.'),
  corner_names: z
    .array(z.string())
    .optional()
    .describe('Optional corner labels matching liberty_files order.'),
  sdc_file: z.string().optional().describe('Optional SDC timing constraints file path'),
  clock_period_ns: z.number().optional().default(1.0).describe('Target clock period in ns if no SDC provided (default: 1.0)'),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(60000).describe('Timeout per corner in milliseconds'),
});

function cornerName(liberty: string, idx: number, names?: string[]): string {
  if (names && names[idx]) return names[idx];
  const base = path.basename(liberty);
  return base.replace(/\.lib$/i, '');
}

export async function handleOpenroadStaCorners(
  runner: ToolRunner,
  args: z.infer<typeof openroadStaCornersSchema>
) {
  const defaultPlatform = getDefaultPlatformPaths();
  const names = args.corner_names;
  if (names && names.length !== args.liberty_files.length) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { success: false, corners: [], allMet: false, warnings: [], errors: ['corner_names length must match liberty_files length.'] },
            null,
            2
          ),
        },
      ],
    };
  }

  const result: StaCornersResult = {
    success: true,
    corners: [],
    allMet: true,
    warnings: [],
    errors: [],
  };

  for (let i = 0; i < args.liberty_files.length; i += 1) {
    const liberty = args.liberty_files[i];
    const corner = cornerName(liberty, i, names);

    const tcl = generateStaTcl(
      {
        defFile: args.def_file,
        topModule: args.top_module,
        sdcFile: args.sdc_file,
        clockPeriodNs: args.clock_period_ns,
      },
      { ...defaultPlatform, liberty }
    );

    const res = await runner.runTcl(tcl, {
      cwd: args.cwd,
      timeoutMs: args.timeout_ms,
    });

    if (res.exitCode !== 0) {
      result.success = false;
      result.allMet = false;
      result.errors.push(`Corner '${corner}' STA failed: ${res.stderr.trim() || 'execution failed'}`);
      continue;
    }

    const parsed = parseOpenStaReport(res.stdout);
    result.corners.push({
      corner,
      liberty,
      wns: parsed.timing.wns,
      tns: parsed.timing.tns,
      timingMet: parsed.timing.timingMet,
    });
    if (!parsed.timing.timingMet) result.allMet = false;
  }

  let worstWns: number | undefined;
  let worstCorner: string | undefined;
  for (const c of result.corners) {
    if (worstWns === undefined || c.wns < worstWns) {
      worstWns = c.wns;
      worstCorner = c.corner;
    }
  }
  result.worstCorner = worstCorner;
  result.worstWns = worstWns;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
