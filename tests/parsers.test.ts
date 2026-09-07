import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenRoadOutput, parseCtsSummary, parseDrcIssues, parsePowerReport, countRoutedWires, countSignalRoutedWires } from '../src/parsers/metric_parser.js';
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

test('parseCtsSummary reads inserted buffers and nets', () => {
  const out = `[INFO CTS-0018]     Created 3 clock buffers.
[INFO CTS-0015]     Created 3 clock nets.
`;
  const cts = parseCtsSummary(out);
  assert.equal(cts.buffers, 3);
  assert.equal(cts.nets, 3);
  assert.deepEqual(parseCtsSummary('no cts here'), { buffers: undefined, nets: undefined });
});

test('parseDrcIssues counts DRT errors and access failures', () => {
  const out = `[ERROR DRT-0073] No access point for clkbuf_0_clk/A.
plain line
[ERROR DRT-0073] No access point for x/B.
`;
  const drc = parseDrcIssues(out);
  assert.equal(drc.count, 2);
  assert.equal(drc.samples.length, 2);
  assert.equal(parseDrcIssues('clean run').count, 0);
});

test('parsePowerReport reads Total watts and group split', () => {
  const out = `Group                  Internal  Switching    Leakage      Total
Sequential             3.24e-05   0.00e+00   3.39e-07   3.28e-05  62.7%
Total                  4.46e-05   7.04e-06   5.96e-07   5.23e-05 100.0%
`;
  const power = parsePowerReport(out);
  assert.equal(power.totalW, 5.23e-05);
  assert.equal(power.internalW, 4.46e-05);
  assert.equal(power.breakdown?.sequential, 3.28e-05);
  assert.equal(parsePowerReport('no power').totalW, undefined);
});

test('countRoutedWires counts ROUTED continuations only', () => {
  const def = `VERSION 5.8 ;
DESIGN top ;
NETS 2 ;
- n1 ( u1 A ) ;
+ ROUTED metal2 ( 0 0 ) ;
+ ROUTED metal2 ( 100 0 ) ;
- n2 ( u2 B ) ;
END NETS
END DESIGN
`;
  assert.equal(countRoutedWires(def), 2);
  assert.equal(countRoutedWires('VERSION 5.8 ;\nEND DESIGN\n'), 0);
});

test('countSignalRoutedWires ignores SPECIALNETS power stripes', () => {
  const def = `VERSION 5.8 ;
SPECIALNETS 2 ;
    - VDD + USE POWER
      + ROUTED met5 1600 + SHAPE STRIPE ( 0 0 ) ( 100 0 )
      + ROUTED met4 1600 + SHAPE STRIPE ( 0 0 ) ( 0 100 )
    - VSS + USE GROUND
      + ROUTED met5 1600 + SHAPE STRIPE ( 0 50 ) ( 100 50 )
END SPECIALNETS
NETS 1 ;
    - n1 ( u1 A ) ( u2 X ) + USE SIGNAL ;
END NETS
`;
  assert.equal(countRoutedWires(def), 3);
  assert.equal(countSignalRoutedWires(def), 0);
});
