import test from 'node:test';
import assert from 'node:assert/strict';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../src/server.js';

test('MCP server registers required OpenROAD physical design tools', async () => {
  const server = createServer();
  const handler = (server as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);

  assert.ok(handler, 'ListTools handler should be registered');

  const response = await handler({ method: 'tools/list' });
  assert.ok(response.tools, 'Tools list must be returned');

  const toolNames = response.tools.map((t: any) => t.name);

  assert.ok(toolNames.includes('openroad_pnr'), 'Should expose openroad_pnr');
  assert.ok(toolNames.includes('openroad_floorplan'), 'Should expose openroad_floorplan');
  assert.ok(toolNames.includes('openroad_place'), 'Should expose openroad_place');
  assert.ok(toolNames.includes('openroad_route'), 'Should expose openroad_route');
  assert.ok(toolNames.includes('openroad_sta'), 'Should expose openroad_sta');
  assert.ok(toolNames.includes('openroad_toolchain_info'), 'Should expose openroad_toolchain_info');

  for (const tool of response.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description && tool.description.length > 10);
  }
});
