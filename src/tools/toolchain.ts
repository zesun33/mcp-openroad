import { ToolRunner } from '../runner.js';
import { z } from 'zod';

export const openroadToolchainInfoSchema = z.object({
  cwd: z.string().optional().describe('Optional workspace directory'),
});

export async function handleOpenroadToolchainInfo(
  runner: ToolRunner,
  args: z.infer<typeof openroadToolchainInfoSchema>
) {
  const info = await runner.getToolchainInfo(args.cwd);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(info, null, 2),
      },
    ],
  };
}
