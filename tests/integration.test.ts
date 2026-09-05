import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRunner } from '../src/runner.js';
import { handleOpenroadToolchainInfo } from '../src/tools/toolchain.js';
import { handleOpenroadFloorplan } from '../src/tools/floorplan.js';
import { handleOpenroadPnr } from '../src/tools/pnr.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('Integration: openroad_toolchain_info probes OpenROAD and OpenSTA versions', async () => {
  const runner = new ToolRunner();
  const res = await handleOpenroadToolchainInfo(runner, { cwd: projectRoot });

  assert.ok(res.content[0].text);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.runtime, 'podman');
  assert.ok(data.openroadVersion.includes('2.0') || data.openroadVersion.length > 3);
  assert.ok(data.platforms.includes('nangate45'));
});

test('Integration: openroad_floorplan initializes die and core boundaries', async () => {
  const runner = new ToolRunner();
  const res = await handleOpenroadFloorplan(runner, {
    netlist_file: 'fixtures/counter_netlist.v',
    top_module: 'counter',
    die_width: 50,
    die_height: 50,
    core_margin: 5,
    cwd: projectRoot,
  });

  assert.ok(res.content[0].text);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.success, true);
  assert.equal(data.pinsPlaced, 6);
  assert.ok(data.dieArea);
  assert.equal(data.dieArea.width, 50);
});

test('Integration: openroad_pnr executes full placement, routing, and timing closure', async () => {
  const runner = new ToolRunner();
  const res = await handleOpenroadPnr(runner, {
    netlist_file: 'fixtures/counter_netlist.v',
    top_module: 'counter',
    sdc_file: 'fixtures/counter.sdc',
    core_utilization: 0.4,
    cwd: projectRoot,
    timeout_ms: 60000,
  });

  assert.ok(res.content[0].text);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.success, true);
  assert.equal(data.topModule, 'counter');
  assert.equal(data.cellCount, 13);
  assert.ok(data.hpwl && data.hpwl > 0);
  assert.equal(data.timing.timingMet, true);
  assert.ok(data.defFile);
});
