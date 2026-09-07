import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultPlatformPaths,
  getSky130PlatformPaths,
  generatePnrTcl,
} from '../src/flow/generator.js';

test('sky130 platform resolves PDK file layout', () => {
  const plat = getSky130PlatformPaths('/pdk');
  assert.equal(plat.techLef, '/pdk/sky130A/libs.ref/sky130_fd_sc_hd/techlef/sky130_fd_sc_hd__nom.tlef');
  assert.equal(plat.macroLef, '/pdk/sky130A/libs.ref/sky130_fd_sc_hd/lef/sky130_fd_sc_hd.lef');
  assert.ok(plat.liberty.endsWith('sky130_fd_sc_hd__tt_100C_1v80.lib'));
  assert.equal(plat.siteName, 'unithd');
  assert.equal(plat.pinHorLayer, 'met3');
  assert.equal(plat.pinVerLayer, 'met2');
});

test('nangate45 defaults are untouched (proven behavior)', () => {
  const plat = getDefaultPlatformPaths();
  assert.equal(plat.siteName, 'FreePDK45_38x28_10R_NP_162NW_34O');
  assert.equal(plat.pinHorLayer, 'metal3');
  assert.equal(plat.pinVerLayer, 'metal2');
  assert.equal(plat.densityMargin, undefined);
});

test('sky130 P&R script uses PDK tech, site, layers, and density headroom', () => {
  const plat = getSky130PlatformPaths('/pdk');
  const tcl = generatePnrTcl(
    { netlistFile: 'counter_sky130.v', topModule: 'counter', coreUtilization: 0.5, outputDef: 'counter_sky130.def' },
    plat
  );
  assert.ok(tcl.includes('read_lef "/pdk/sky130A/libs.ref/sky130_fd_sc_hd/techlef/sky130_fd_sc_hd__nom.tlef"'));
  assert.ok(tcl.includes('sky130_fd_sc_hd__tt_100C_1v80.lib'));
  assert.ok(tcl.includes('initialize_floorplan -site "unithd"'));
  assert.ok(tcl.includes('place_pins -hor_layer met3 -ver_layer met2'));
  // 0.5 utilization + 0.15 margin (GPL-0302 headroom, proven live).
  assert.ok(tcl.includes('global_placement -density 0.65'));
  assert.ok(tcl.includes('write_def "counter_sky130.def"'));
});

test('nangate45 P&R script keeps exact density tie', () => {
  const plat = getDefaultPlatformPaths();
  const tcl = generatePnrTcl(
    { netlistFile: 'counter.v', topModule: 'counter', coreUtilization: 0.4, outputDef: 'c.def' },
    plat
  );
  assert.ok(tcl.includes('global_placement -density 0.4'));
  assert.ok(tcl.includes('place_pins -hor_layer metal3 -ver_layer metal2'));
});
