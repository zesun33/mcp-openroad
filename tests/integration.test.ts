import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRunner } from '../src/runner.js';
import { handleOpenroadToolchainInfo } from '../src/tools/toolchain.js';
import { handleOpenroadFloorplan } from '../src/tools/floorplan.js';
import { handleOpenroadPnr } from '../src/tools/pnr.js';
import { handleOpenroadPlace } from '../src/tools/place.js';
import { handleOpenroadRoute } from '../src/tools/route.js';
import { handleOpenroadCts } from '../src/tools/cts.js';
import { handleOpenroadDetailRoute } from '../src/tools/detail_route.js';
import { handleOpenroadStaCorners } from '../src/tools/sta_corners.js';
import { handleOpenroadPower } from '../src/tools/power.js';
import { handleOpenroadEval } from '../src/tools/eval.js';

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

test('Integration: deep flow place -> CTS -> route -> detail_route -> power', async () => {
  const runner = new ToolRunner();

  const fp = await handleOpenroadFloorplan(runner, {
    netlist_file: 'fixtures/counter_netlist.v',
    top_module: 'counter',
    die_width: 50,
    die_height: 50,
    core_margin: 5,
    output_def: 'deep_fp_tmp.def',
    cwd: projectRoot,
  });
  assert.equal(JSON.parse(fp.content[0].text).success, true);

  const place = await handleOpenroadPlace(runner, {
    floorplan_def: 'deep_fp_tmp.def',
    top_module: 'counter',
    density: 0.4,
    output_def: 'deep_place_tmp.def',
    cwd: projectRoot,
  });
  assert.equal(JSON.parse(place.content[0].text).success, true);

  const cts = await handleOpenroadCts(runner, {
    placed_def: 'deep_place_tmp.def',
    top_module: 'counter',
    sdc_file: 'fixtures/counter.sdc',
    output_def: 'deep_cts_tmp.def',
    cwd: projectRoot,
    timeout_ms: 120000,
  });
  const ctsData = JSON.parse(cts.content[0].text);
  assert.equal(ctsData.success, true);
  assert.ok((ctsData.clockBuffers ?? 0) > 0, `Expected clock buffers, got ${JSON.stringify(ctsData)}`);
  assert.ok(ctsData.defFile);

  const route = await handleOpenroadRoute(runner, {
    placed_def: 'deep_cts_tmp.def',
    top_module: 'counter',
    output_def: 'deep_route_tmp.def',
    cwd: projectRoot,
    timeout_ms: 120000,
  });
  assert.equal(JSON.parse(route.content[0].text).success, true);

  const droute = await handleOpenroadDetailRoute(runner, {
    routed_def: 'deep_route_tmp.def',
    top_module: 'counter',
    output_def: 'deep_droute_tmp.def',
    cwd: projectRoot,
    timeout_ms: 300000,
  });
  const drouteData = JSON.parse(droute.content[0].text);
  assert.equal(drouteData.success, true);
  assert.equal(typeof drouteData.drcIssues, 'number');
  assert.ok(Array.isArray(drouteData.drcSamples));

  const power = await handleOpenroadPower(runner, {
    def_file: 'deep_place_tmp.def',
    top_module: 'counter',
    sdc_file: 'fixtures/counter.sdc',
    cwd: projectRoot,
    timeout_ms: 120000,
  });
  const powerData = JSON.parse(power.content[0].text);
  assert.equal(powerData.success, true);
  assert.ok(typeof powerData.totalW === 'number' && powerData.totalW > 0, `Expected totalW > 0, got ${powerData.totalW}`);
});

test('Integration: openroad_sta_corners reports per-corner timing', async () => {
  const runner = new ToolRunner();
  const res = await handleOpenroadStaCorners(runner, {
    def_file: 'deep_place_tmp.def',
    top_module: 'counter',
    liberty_files: ['platforms/nangate45/NangateOpenCellLibrary_typical.lib'],
    corner_names: ['typical'],
    sdc_file: 'fixtures/counter.sdc',
    cwd: projectRoot,
    timeout_ms: 120000,
  });
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.success, true);
  assert.equal(data.corners.length, 1);
  assert.equal(data.corners[0].corner, 'typical');
  assert.equal(typeof data.corners[0].wns, 'number');
  assert.equal(data.worstCorner, 'typical');
});

test('Integration: openroad_eval runs ad-hoc Tcl', async () => {
  const runner = new ToolRunner();
  const res = await handleOpenroadEval(runner, {
    tcl: 'puts "EVAL_HELLO"',
    cwd: projectRoot,
  });
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.success, true);
  assert.ok(data.stdout.includes('EVAL_HELLO'));
  assert.equal(data.truncated, false);
});

test('Integration: openroad_sta_corners rejects mismatched corner names', async () => {
  const runner = new ToolRunner();
  const res = await handleOpenroadStaCorners(runner, {
    def_file: 'deep_place_tmp.def',
    top_module: 'counter',
    liberty_files: ['platforms/nangate45/NangateOpenCellLibrary_typical.lib'],
    corner_names: ['a', 'b'],
    cwd: projectRoot,
  });
  assert.equal(JSON.parse(res.content[0].text).success, false);
});
