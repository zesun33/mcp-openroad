import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { getDefaultPlatformPaths, generateStaTcl } from '../flow/generator.js';
import { parseOpenStaReport } from '../parsers/sta_parser.js';
import { StaResult } from '../parsers/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export const openroadStaSchema = z.object({
  def_file: z.string().describe('DEF file path (placed or routed)'),
  top_module: z.string().describe('Name of the top-level module'),
  sdc_file: z.string().optional().describe('Optional SDC timing constraints file'),
  clock_period_ns: z.number().optional().default(1.0).describe('Target clock period in ns (default: 1.0)'),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadSta(
  runner: ToolRunner,
  args: z.infer<typeof openroadStaSchema>
) {
  const defaultPlatform = getDefaultPlatformPaths();

  const tcl = generateStaTcl(
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

  const parsed = parseOpenStaReport(res.stdout);

  const result: StaResult = {
    timingMet: parsed.timing.timingMet,
    wns: parsed.timing.wns,
    tns: parsed.timing.tns,
    clockPeriod: args.clock_period_ns,
    criticalPaths: parsed.criticalPaths,
    warnings: [],
    errors: res.exitCode !== 0 ? [res.stderr.trim() || 'STA execution failed'] : [],
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
