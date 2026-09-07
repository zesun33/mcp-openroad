import { z } from 'zod';
import { ToolRunner } from '../runner.js';
import { parseOpenRoadOutput } from '../parsers/metric_parser.js';
import { EvalResult } from '../parsers/types.js';

const MAX_TCL_CHARS = 8000;
const MAX_OUT_CHARS = 4000;

export const openroadEvalSchema = z.object({
  tcl: z
    .string()
    .min(1)
    .max(MAX_TCL_CHARS)
    .describe(
      'Tcl snippet to evaluate in a fresh OpenROAD session (stateless: include any read_lef/read_liberty/read_def setup the query needs).'
    ),
  cwd: z.string().optional().describe('Optional working directory'),
  timeout_ms: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

export async function handleOpenroadEval(
  runner: ToolRunner,
  args: z.infer<typeof openroadEvalSchema>
) {
  const res = await runner.runTcl(args.tcl, {
    cwd: args.cwd,
    timeoutMs: args.timeout_ms,
  });

  const metrics = parseOpenRoadOutput(res.stdout, res.stderr);
  const truncated = res.stdout.length > MAX_OUT_CHARS;

  const result: EvalResult = {
    success: res.exitCode === 0,
    stdout: truncated ? `${res.stdout.slice(0, MAX_OUT_CHARS)}\n...[truncated]` : res.stdout,
    truncated,
    warnings: metrics.warnings.slice(0, 10),
    errors: res.exitCode !== 0 ? [res.stderr.trim() || 'Tcl evaluation failed'] : [],
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
