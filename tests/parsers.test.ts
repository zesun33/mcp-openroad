import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenRoadOutput } from '../src/parsers/metric_parser.js';
import { parseOpenStaReport } from '../src/parsers/sta_parser.js';

test('parseOpenRoadOutput extracts cell count, utilization, and HPWL', () => {
  const stdout = `
[INFO GPL-0002] DBU: 2000
[INFO GPL-0006] NumInstances: 42
[INFO GPL-0012] DieAreaLxLy: 0 0
[INFO GPL-0013] DieAreaUxUy: 120000 120000
[INFO GPL-0014] CoreAreaLxLy: 10000 10000
[INFO GPL-0015] CoreAreaUxUy: 110000 110000
[INFO GPL-0019] Util(%): 24.50
[INFO PPL-0002] Number of I/O             8
total displacement         15.4 u
max displacement            2.1 u
legalized HPWL            230.8 u
`;
  const metrics = parseOpenRoadOutput(stdout, '');

  assert.equal(metrics.cellCount, 42);
  assert.equal(metrics.utilization, 24.5);
  assert.equal(metrics.pinsPlaced, 8);
  assert.equal(metrics.hpwl, 230.8);
  assert.equal(metrics.totalDisplacement, 15.4);
  assert.equal(metrics.maxDisplacement, 2.1);

  assert.ok(metrics.dieArea);
  assert.equal(metrics.dieArea.width, 60);
  assert.equal(metrics.dieArea.height, 60);

  assert.ok(metrics.coreArea);
  assert.equal(metrics.coreArea.width, 50);
  assert.equal(metrics.coreArea.height, 50);
});

test('parseOpenStaReport extracts timing slack and critical paths accurately', () => {
  const staLog = `
Startpoint: rst (input port clocked by core_clock)
Endpoint: _20_ (recovery check against rising-edge clock core_clock)
Path Group: asynchronous
Path Type: max

  Delay    Time   Description
---------------------------------------------------------
   0.20    0.20 v input external delay
           0.84   slack (MET)

wns 0.00
tns 0.00
worst slack 0.84
`;

  const parsed = parseOpenStaReport(staLog);

  assert.equal(parsed.timing.timingMet, true);
  assert.equal(parsed.timing.wns, 0.0);
  assert.equal(parsed.timing.tns, 0.0);
  assert.equal(parsed.criticalPaths.length, 1);
  assert.equal(parsed.criticalPaths[0].startpoint, 'rst (input port clocked by core_clock)');
  assert.equal(parsed.criticalPaths[0].endpoint, '_20_ (recovery check against rising-edge clock core_clock)');
  assert.equal(parsed.criticalPaths[0].slack, 0.84);
  assert.equal(parsed.criticalPaths[0].pathGroup, 'asynchronous');
  assert.equal(parsed.criticalPaths[0].pathType, 'max');
});

test('parseOpenStaReport flags timing violations when slack is negative', () => {
  const staLog = `
Startpoint: in_a
Endpoint: out_q
Path Group: core_clock
Path Type: max
           -0.35  slack (VIOLATED)

wns -0.35
tns -1.40
worst slack -0.35
`;

  const parsed = parseOpenStaReport(staLog);
  assert.equal(parsed.timing.timingMet, false);
  assert.equal(parsed.timing.wns, -0.35);
  assert.equal(parsed.timing.tns, -1.40);
  assert.equal(parsed.criticalPaths.length, 1);
  assert.equal(parsed.criticalPaths[0].slack, -0.35);
});
