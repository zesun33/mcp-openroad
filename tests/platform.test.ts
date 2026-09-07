import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultPlatformPaths,
  getSky130PlatformPaths,
  generatePnrTcl,
  generatePdnCommands,
  generatePdnTcl,
  generateCtsCommand,
} from '../src/flow/generator.js';
import { handleOpenroadPnr } from '../src/tools/pnr.js';
import { handleOpenroadPdn } from '../src/tools/pdn.js';
import { ToolRunner } from '../src/runner.js';

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

test('pnr script includes detailed_route only when requested', () => {
  const plat = getDefaultPlatformPaths();
  const base = { netlistFile: 'c.v', topModule: 'c', outputDef: 'c.def' };
  const plain = generatePnrTcl(base, plat);
  assert.ok(!plain.includes('detailed_route'), 'default pnr must stay global-route-only');
  const detailed = generatePnrTcl({ ...base, detailRoute: true }, plat);
  assert.ok(detailed.includes('\ndetailed_route\n'), 'detail flag must emit detailed_route');
});

test('pnr script emits tapcell and filler blocks only when requested with config', () => {
  const sky = getSky130PlatformPaths('/pdk');
  const base = { netlistFile: 'c.v', topModule: 'c', outputDef: 'c.def' };
  const plain = generatePnrTcl(base, sky);
  assert.ok(!plain.includes('tapcell '), 'taps off by default');
  assert.ok(!plain.includes('filler_placement'), 'fillers off by default');
  const full = generatePnrTcl({ ...base, tapcells: true, fillers: true }, sky);
  assert.ok(full.includes('tapcell -tapcell_master sky130_fd_sc_hd__tap_1 -endcap_master sky130_fd_sc_hd__decap_4 -distance 14'));
  assert.ok(full.includes('filler_placement {sky130_fd_sc_hd__fill_1 sky130_fd_sc_hd__fill_2 sky130_fd_sc_hd__fill_4 sky130_fd_sc_hd__fill_8 sky130_fd_sc_hd__decap_4 sky130_fd_sc_hd__decap_8}'));
  // Tap before place (ORFS floorplan order); fillers after routing.
  assert.ok(full.indexOf('tapcell ') < full.indexOf('global_placement'));
  assert.ok(full.indexOf('filler_placement') > full.indexOf('global_route'));
});

test('pnr script emits CTS only when requested, after place and before route', () => {
  const sky = getSky130PlatformPaths('/pdk');
  const base = { netlistFile: 'c.v', topModule: 'c', outputDef: 'c.def' };
  const plain = generatePnrTcl(base, sky);
  assert.ok(!plain.includes('clock_tree_synthesis'), 'CTS off by default');
  const withCts = generatePnrTcl({ ...base, tapcells: true, pdn: true, cts: true }, sky);
  assert.ok(withCts.includes('clock_tree_synthesis -root_buf sky130_fd_sc_hd__clkbuf_16'));
  assert.ok(withCts.includes('set_propagated_clock [all_clocks]'));
  const pdnAt = withCts.indexOf('pdngen');
  const placeAt = withCts.indexOf('global_placement');
  const ctsAt = withCts.indexOf('clock_tree_synthesis');
  const routeAt = withCts.indexOf('global_route');
  assert.ok(pdnAt >= 0 && pdnAt < placeAt, 'pdngen before place');
  assert.ok(ctsAt > placeAt && routeAt > ctsAt, 'order: place -> cts -> global_route');
});

test('sky130 platform ships a PDN grid; nangate45 does not', () => {
  const sky = getSky130PlatformPaths('/pdk');
  const nang = getDefaultPlatformPaths();
  assert.ok(sky.pdn, 'sky130 must define PDN config');
  assert.equal(sky.pdn?.powerNet, 'VDD');
  assert.equal(sky.pdn?.groundNet, 'VSS');
  assert.equal(nang.pdn, undefined);
  const cmds = generatePdnCommands(sky);
  assert.ok(cmds.includes('add_global_connection -net {VDD}'));
  assert.ok(cmds.includes('-pin_pattern {^VPWR$} -power'));
  assert.ok(cmds.includes('-pin_pattern {^VGND$} -ground'));
  assert.ok(cmds.includes('set_voltage_domain -name {CORE} -power {VDD} -ground {VSS}'));
  assert.ok(cmds.includes('define_pdn_grid -name {grid} -pins {met5}'));
  assert.ok(cmds.includes('add_pdn_stripe -grid {grid} -layer {met1} -width {0.48} -followpins'));
  assert.ok(cmds.includes('add_pdn_stripe -grid {grid} -layer {met4} -width {1.6} -pitch {56} -offset {2}'));
  assert.ok(cmds.includes('add_pdn_connect -grid {grid} -layers {met1 met4}'));
  assert.ok(cmds.includes('pdngen'));
  assert.equal(generatePdnCommands(nang), '');
});

test('pnr script emits pdngen only when requested, after taps and before place', () => {
  const sky = getSky130PlatformPaths('/pdk');
  const base = { netlistFile: 'c.v', topModule: 'c', outputDef: 'c.def' };
  const plain = generatePnrTcl(base, sky);
  assert.ok(!plain.includes('pdngen'), 'PDN off by default');
  const withPdn = generatePnrTcl({ ...base, tapcells: true, pdn: true }, sky);
  assert.ok(withPdn.includes('pdngen'));
  const tapAt = withPdn.indexOf('tapcell ');
  const pdnAt = withPdn.indexOf('pdngen');
  const placeAt = withPdn.indexOf('global_placement');
  const routeAt = withPdn.indexOf('global_route');
  assert.ok(tapAt >= 0 && pdnAt > tapAt && pdnAt < placeAt && routeAt > placeAt, 'order: tapcell -> pdngen -> place -> global_route');
});

test('generatePdnTcl writes a step-tool script with PDN_COMPLETE', () => {
  const sky = getSky130PlatformPaths('/pdk');
  const tcl = generatePdnTcl({ placedDef: 'placed.def', topModule: 'c', outputDef: 'c_pdn.def' }, sky);
  assert.ok(tcl.includes('read_def "placed.def"'));
  assert.ok(tcl.includes('pdngen'));
  assert.ok(tcl.includes('write_def "c_pdn.def"'));
  assert.ok(tcl.includes('PDN_COMPLETE'));
});

test('openroad_pnr pdn on nangate45 fails honestly without spawning OpenROAD', async () => {
  await assert.rejects(
    handleOpenroadPnr(new ToolRunner(), {
      netlist_file: 'c.v',
      top_module: 'c',
      pdn: true,
    }),
    /no PDN config/
  );
});

test('openroad_pdn on nangate45 fails honestly without spawning OpenROAD', async () => {
  await assert.rejects(
    handleOpenroadPdn(new ToolRunner(), {
      placed_def: 'placed.def',
      top_module: 'c',
    }),
    /no PDN config/
  );
});

test('sky130 CTS uses clkbuf_16/8/4 not inferred clkbuf_1', () => {
  const sky = getSky130PlatformPaths('/pdk');
  const cmd = generateCtsCommand(sky);
  assert.ok(cmd.includes('-root_buf sky130_fd_sc_hd__clkbuf_16'));
  assert.ok(cmd.includes('sky130_fd_sc_hd__clkbuf_4'));
  assert.equal(generateCtsCommand(getDefaultPlatformPaths()), 'clock_tree_synthesis');
});

test('sky130 pnr script sets routing layers, wire RC, and global-routing parasitics', () => {
  const sky = getSky130PlatformPaths('/pdk');
  const tcl = generatePnrTcl(
    { netlistFile: 'c.v', topModule: 'c', outputDef: 'c.def', detailRoute: true, cts: true },
    sky
  );
  assert.ok(tcl.includes('set_routing_layers -signal met1-met5 -clock met3-met5'));
  assert.ok(tcl.includes('set_wire_rc -signal -layer met2'));
  assert.ok(tcl.includes('set_wire_rc -clock -layer met5'));
  assert.ok(tcl.includes('global_route -congestion_iterations 50'));
  assert.ok(tcl.includes('detailed_route -bottom_routing_layer met1 -top_routing_layer met5'));
  assert.ok(tcl.includes('estimate_parasitics -global_routing'));
  const nang = generatePnrTcl(
    { netlistFile: 'c.v', topModule: 'c', outputDef: 'c.def', detailRoute: true },
    getDefaultPlatformPaths()
  );
  assert.ok(nang.includes('\nglobal_route\n'));
  assert.ok(nang.includes('\ndetailed_route\n'));
  assert.ok(!nang.includes('set_routing_layers'));
});
