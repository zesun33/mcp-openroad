export interface PlatformPaths {
  techLef: string;
  macroLef: string;
  liberty: string;
  siteName: string;
  pinHorLayer: string;
  pinVerLayer: string;
  // Extra headroom added to core utilization for the placer's target
  // density. Sky130 needs ~0.15 on small designs (GPL-0302 otherwise);
  // nangate45 keeps proven exact-tie behavior when unset.
  densityMargin?: number;
  // Well-tap / endcap insertion (sky130 needs these; no PDN required).
  tapcellMaster?: string;
  endcapMaster?: string;
  tapDistance?: number;
  // Gap fillers + decaps placed after routing (TCL list form).
  fillerMasters?: string[];
  // Stdcell PDN grid (followpins rails + upper straps). Sky130 only;
  // nangate45 has none so callers error honestly. In openroad_pnr this
  // runs after tapcell / before place (ORFS order) so GPL sees straps.
  pdn?: PdnConfig;
  // Optional routing/RC/CTS knobs. Unset on nangate45 so that proven
  // counter scripts stay byte-identical except for post-route STA.
  signalRoutingLayers?: string;
  clockRoutingLayers?: string;
  routeBottomLayer?: string;
  routeTopLayer?: string;
  wireRcSignalLayer?: string;
  wireRcClockLayer?: string;
  ctsRootBuf?: string;
  ctsBufList?: string[];
}

export interface PdnStripe {
  layer: string;
  width: number;
  pitch?: number;
  offset?: number;
  followpins?: boolean;
}

export interface PdnConfig {
  powerNet: string;
  groundNet: string;
  powerPinPatterns: string[];
  groundPinPatterns: string[];
  gridName: string;
  pinLayers: string[];
  stripes: PdnStripe[];
  connectLayers: [string, string][];
}

export function getDefaultPlatformPaths(): PlatformPaths {
  return {
    techLef: '/opt/platforms/nangate45/NangateOpenCellLibrary.tech.lef',
    macroLef: '/opt/platforms/nangate45/NangateOpenCellLibrary.macro.lef',
    liberty: '/opt/platforms/nangate45/NangateOpenCellLibrary_typical.lib',
    siteName: 'FreePDK45_38x28_10R_NP_162NW_34O',
    pinHorLayer: 'metal3',
    pinVerLayer: 'metal2',
  };
}

// Sky130 (sky130_fd_sc_hd, tt corner) via a host-side volare PDK.
// pdkRoot is the container mount (/pdk) or the host cache dir.
export function getSky130PlatformPaths(pdkRoot: string): PlatformPaths {
  const rel = (p: string) => `${pdkRoot}/sky130A/${p}`;
  return {
    techLef: rel('libs.ref/sky130_fd_sc_hd/techlef/sky130_fd_sc_hd__nom.tlef'),
    macroLef: rel('libs.ref/sky130_fd_sc_hd/lef/sky130_fd_sc_hd.lef'),
    liberty: rel('libs.ref/sky130_fd_sc_hd/lib/sky130_fd_sc_hd__tt_100C_1v80.lib'),
    siteName: 'unithd',
    pinHorLayer: 'met3',
    pinVerLayer: 'met2',
    densityMargin: 0.15,
    tapcellMaster: 'sky130_fd_sc_hd__tap_1',
    endcapMaster: 'sky130_fd_sc_hd__decap_4',
    tapDistance: 14,
    fillerMasters: [
      'sky130_fd_sc_hd__fill_1',
      'sky130_fd_sc_hd__fill_2',
      'sky130_fd_sc_hd__fill_4',
      'sky130_fd_sc_hd__fill_8',
      'sky130_fd_sc_hd__decap_4',
      'sky130_fd_sc_hd__decap_8',
    ],
    // ORFS sky130hd-class grid: met1 followpins rails + met4/met5 straps.
    // Inserted before place so cells are not parked under straps (that
    // combination is DRT-0073 on CTS clkbuf pins). Pitch 56 um keeps
    // straps sparse enough not to starve signal routing.
    pdn: {
      powerNet: 'VDD',
      groundNet: 'VSS',
      powerPinPatterns: ['^VPWR$', '^VPB$'],
      groundPinPatterns: ['^VGND$', '^VNB$'],
      gridName: 'grid',
      pinLayers: ['met5'],
      stripes: [
        { layer: 'met1', width: 0.48, followpins: true },
        { layer: 'met4', width: 1.6, pitch: 56.0, offset: 2.0 },
        { layer: 'met5', width: 1.6, pitch: 56.0, offset: 2.0 },
      ],
      connectLayers: [
        ['met1', 'met4'],
        ['met4', 'met5'],
      ],
    },
    signalRoutingLayers: 'met1-met5',
    clockRoutingLayers: 'met3-met5',
    routeBottomLayer: 'met1',
    routeTopLayer: 'met5',
    wireRcSignalLayer: 'met2',
    wireRcClockLayer: 'met5',
    ctsRootBuf: 'sky130_fd_sc_hd__clkbuf_16',
    ctsBufList: [
      'sky130_fd_sc_hd__clkbuf_16',
      'sky130_fd_sc_hd__clkbuf_8',
      'sky130_fd_sc_hd__clkbuf_4',
    ],
  };
}

/** Tcl block for pdngen. Empty string when the platform has no PDN config. */
export function generatePdnCommands(plat: PlatformPaths): string {
  const p = plat.pdn;
  if (!p) return '';
  const lines: string[] = [
    '# PDN stdcell grid (followpins rails + upper straps; targets DRT-0073 pin-access)',
  ];
  for (const pat of p.powerPinPatterns) {
    lines.push(
      `add_global_connection -net {${p.powerNet}} -inst_pattern {.*} -pin_pattern {${pat}} -power`
    );
  }
  for (const pat of p.groundPinPatterns) {
    lines.push(
      `add_global_connection -net {${p.groundNet}} -inst_pattern {.*} -pin_pattern {${pat}} -ground`
    );
  }
  lines.push(`set_voltage_domain -name {CORE} -power {${p.powerNet}} -ground {${p.groundNet}}`);
  lines.push(`define_pdn_grid -name {${p.gridName}} -pins {${p.pinLayers.join(' ')}}`);
  for (const s of p.stripes) {
    if (s.followpins) {
      lines.push(
        `add_pdn_stripe -grid {${p.gridName}} -layer {${s.layer}} -width {${s.width}} -followpins`
      );
    } else {
      lines.push(
        `add_pdn_stripe -grid {${p.gridName}} -layer {${s.layer}} -width {${s.width}} -pitch {${s.pitch}} -offset {${s.offset}}`
      );
    }
  }
  for (const [a, b] of p.connectLayers) {
    lines.push(`add_pdn_connect -grid {${p.gridName}} -layers {${a} ${b}}`);
  }
  lines.push('pdngen');
  return lines.join('\n');
}

/** TritonCTS command. Bare `clock_tree_synthesis` infers clkbuf_1 on Sky130
 *  (unroutable pin-access). When the platform lists clock buffers, use them. */
export function generateCtsCommand(plat: PlatformPaths): string {
  if (plat.ctsRootBuf && plat.ctsBufList && plat.ctsBufList.length > 0) {
    return (
      `clock_tree_synthesis -root_buf ${plat.ctsRootBuf}` +
      ` -buf_list {${plat.ctsBufList.join(' ')}} -sink_clustering_enable`
    );
  }
  return 'clock_tree_synthesis';
}

export type PlatformName = 'nangate45' | 'sky130';

export function resolvePlatformPaths(
  runner: { getPdkDir(): string | null; getRuntime(): string },
  name?: string
): PlatformPaths {
  if (name === 'sky130') {
    const dir = runner.getPdkDir();
    if (!dir) {
      throw new Error(
        "Platform 'sky130' needs the Sky130 PDK: set MCP_OPENROAD_PDK_ROOT to a volare sky130 cache (the <sha> version dir)."
      );
    }
    return getSky130PlatformPaths(runner.getRuntime() === 'host' ? dir : '/pdk');
  }
  return getDefaultPlatformPaths();
}

export interface PnrScriptOptions {
  netlistFile: string;
  topModule: string;
  sdcFile?: string;
  clockPeriodNs?: number;
  coreUtilization?: number;
  outputDef?: string;
  platform?: PlatformPaths;
  // Run detailed_route after global routing (real wires in the DEF).
  // Default false: global-route-only DEFs stream/extract as expected.
  detailRoute?: boolean;
  // Insert well-tap/endcap cells after floorplan, before place (ORFS
  // order; needs platform tapcell config). No PDN required.
  tapcells?: boolean;
  // Fill placement gaps with filler/decap cells after routing.
  fillers?: boolean;
  // Insert stdcell PDN (needs platform.pdn, e.g. sky130). After taps,
  // before place so GPL/CTS see the straps (ORFS floorplan order).
  pdn?: boolean;
  // Clock tree synthesis after place, before route. Off by default (tiny
  // nangate45 counters stay unchanged). Required at scale: a 1k-flop
  // star clock makes detailed_route thrash until the tool timeout.
  cts?: boolean;
}

export function generatePnrTcl(options: PnrScriptOptions, defaultPlatform: PlatformPaths): string {
  const plat = options.platform || defaultPlatform;
  const util = options.coreUtilization ?? 0.7;
  const outputDef = options.outputDef || `${options.topModule}_pnr.def`;

  let sdcCommands = '';
  if (options.sdcFile) {
    sdcCommands = `read_sdc "${options.sdcFile}"`;
  } else if (options.clockPeriodNs) {
    sdcCommands = `
current_design "${options.topModule}"
if {[get_ports -quiet clk] != ""} {
  create_clock -name core_clock -period ${options.clockPeriodNs} [get_ports clk]
} elseif {[get_ports -quiet clock] != ""} {
  create_clock -name core_clock -period ${options.clockPeriodNs} [get_ports clock]
} else {
  create_clock -name core_clock -period ${options.clockPeriodNs} [lindex [all_inputs] 0]
}
set_input_delay -clock core_clock [expr ${options.clockPeriodNs} * 0.1] [all_inputs]
set_output_delay -clock core_clock [expr ${options.clockPeriodNs} * 0.1] [all_outputs]
`;
  }

  const utilPercent = Math.round(util * 100);
  const placeDensity = Math.min(0.95, util + (plat.densityMargin ?? 0));

  const tapCmd =
    options.tapcells && plat.tapcellMaster
      ? `tapcell -tapcell_master ${plat.tapcellMaster} -endcap_master ${plat.endcapMaster} -distance ${plat.tapDistance}`
      : '';
  const pdnCmd = options.pdn && plat.pdn ? generatePdnCommands(plat) : '';
  const wireRc = [
    plat.wireRcSignalLayer ? `set_wire_rc -signal -layer ${plat.wireRcSignalLayer}` : '',
    plat.wireRcClockLayer ? `set_wire_rc -clock -layer ${plat.wireRcClockLayer}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const ctsBlock = options.cts
    ? `${generateCtsCommand(plat)}\nset_propagated_clock [all_clocks]\ndetailed_placement`
    : '';
  const routingLayers = plat.signalRoutingLayers
    ? `set_routing_layers -signal ${plat.signalRoutingLayers}${
        plat.clockRoutingLayers ? ` -clock ${plat.clockRoutingLayers}` : ''
      }`
    : '';
  const grCmd = plat.signalRoutingLayers
    ? 'global_route -congestion_iterations 50'
    : 'global_route';
  const drCmd = options.detailRoute
    ? plat.routeBottomLayer && plat.routeTopLayer
      ? `detailed_route -bottom_routing_layer ${plat.routeBottomLayer} -top_routing_layer ${plat.routeTopLayer}`
      : 'detailed_route'
    : '';
  const fillCmd =
    options.fillers && plat.fillerMasters
      ? `filler_placement {${plat.fillerMasters.join(' ')}}`
      : '';

  return `
# Auto-generated OpenROAD PnR Script
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_verilog "${options.netlistFile}"
link_design "${options.topModule}"

${sdcCommands}

initialize_floorplan -site "${plat.siteName}" -utilization ${utilPercent} -aspect_ratio 1.0 -core_space 15.0
make_tracks
place_pins -hor_layer ${plat.pinHorLayer} -ver_layer ${plat.pinVerLayer}
${tapCmd}
${pdnCmd}
${wireRc}

global_placement -density ${placeDensity}
detailed_placement
${ctsBlock}

${routingLayers}
${grCmd}
${drCmd}
${fillCmd}

if {[catch {estimate_parasitics -global_routing}]} {
  estimate_parasitics -placement
}
report_checks -path_delay max
report_wns
report_tns
report_worst_slack -max

write_def "${outputDef}"
puts "PNR_COMPLETE: ${outputDef}"
`;
}

export interface FloorplanScriptOptions {
  netlistFile: string;
  topModule: string;
  dieWidth?: number;
  dieHeight?: number;
  coreMargin?: number;
  outputDef?: string;
  platform?: PlatformPaths;
}

export function generateFloorplanTcl(
  options: FloorplanScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;
  const dw = options.dieWidth ?? 60;
  const dh = options.dieHeight ?? 60;
  const margin = options.coreMargin ?? 5;
  const cw = dw - margin;
  const ch = dh - margin;
  const outputDef = options.outputDef || `${options.topModule}_fp.def`;

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_verilog "${options.netlistFile}"
link_design "${options.topModule}"

initialize_floorplan -site "${plat.siteName}" -die_area "0 0 ${dw} ${dh}" -core_area "${margin} ${margin} ${cw} ${ch}"
make_tracks
place_pins -hor_layer ${plat.pinHorLayer} -ver_layer ${plat.pinVerLayer}

write_def "${outputDef}"
puts "FLOORPLAN_COMPLETE: ${outputDef}"
`;
}

export interface PlacementScriptOptions {
  floorplanDef: string;
  topModule: string;
  density?: number;
  outputDef?: string;
  platform?: PlatformPaths;
}

export function generatePlacementTcl(
  options: PlacementScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;
  const density = options.density ?? 0.7;
  const outputDef = options.outputDef || `${options.topModule}_place.def`;

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_def "${options.floorplanDef}"

global_placement -density ${density}
detailed_placement

write_def "${outputDef}"
puts "PLACEMENT_COMPLETE: ${outputDef}"
`;
}

export interface RouteScriptOptions {
  placedDef: string;
  topModule: string;
  outputDef?: string;
  platform?: PlatformPaths;
}

export function generateRouteTcl(
  options: RouteScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;
  const outputDef = options.outputDef || `${options.topModule}_route.def`;

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_def "${options.placedDef}"

global_route

write_def "${outputDef}"
puts "ROUTE_COMPLETE: ${outputDef}"
`;
}

export interface StaScriptOptions {
  defFile: string;
  topModule: string;
  sdcFile?: string;
  clockPeriodNs?: number;
  platform?: PlatformPaths;
}

export function generateStaTcl(
  options: StaScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;

  let sdcCommands = '';
  if (options.sdcFile) {
    sdcCommands = `read_sdc "${options.sdcFile}"`;
  } else if (options.clockPeriodNs) {
    sdcCommands = `
create_clock [all_inputs] -name core_clock -period ${options.clockPeriodNs}
`;
  }

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_def "${options.defFile}"

${sdcCommands}

estimate_parasitics -placement
report_checks -path_delay max
report_wns
report_tns
report_worst_slack -max
`;
}

export interface CtsScriptOptions {
  placedDef: string;
  topModule: string;
  sdcFile?: string;
  clockPeriodNs?: number;
  outputDef?: string;
  platform?: PlatformPaths;
}

export function generateCtsTcl(
  options: CtsScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;
  const outputDef = options.outputDef || `${options.topModule}_cts.def`;

  let sdcCommands = '';
  if (options.sdcFile) {
    sdcCommands = `read_sdc "${options.sdcFile}"`;
  } else if (options.clockPeriodNs) {
    sdcCommands = `
current_design "${options.topModule}"
if {[get_ports -quiet clk] != ""} {
  create_clock -name core_clock -period ${options.clockPeriodNs} [get_ports clk]
} elseif {[get_ports -quiet clock] != ""} {
  create_clock -name core_clock -period ${options.clockPeriodNs} [get_ports clock]
} else {
  create_clock -name core_clock -period ${options.clockPeriodNs} [lindex [all_inputs] 0]
}
`;
  }

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_def "${options.placedDef}"

${sdcCommands}

${generateCtsCommand(plat)}

estimate_parasitics -placement
report_wns
report_tns

write_def "${outputDef}"
puts "CTS_COMPLETE: ${outputDef}"
`;
}

export interface PdnScriptOptions {
  placedDef: string;
  topModule: string;
  outputDef?: string;
  platform?: PlatformPaths;
}

export function generatePdnTcl(
  options: PdnScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;
  const outputDef = options.outputDef || `${options.topModule}_pdn.def`;
  const pdn = generatePdnCommands(plat);
  if (!pdn) {
    throw new Error('generatePdnTcl: platform defines no PDN config');
  }

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_def "${options.placedDef}"

${pdn}

write_def "${outputDef}"
puts "PDN_COMPLETE: ${outputDef}"
`;
}

export interface DetailRouteScriptOptions {
  routedDef: string;
  topModule: string;
  outputDef?: string;
  platform?: PlatformPaths;
}

export function generateDetailRouteTcl(
  options: DetailRouteScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;
  const outputDef = options.outputDef || `${options.topModule}_droute.def`;

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_def "${options.routedDef}"

detailed_route

write_def "${outputDef}"
puts "DETAIL_ROUTE_COMPLETE: ${outputDef}"
`;
}

export interface PowerScriptOptions {
  defFile: string;
  topModule: string;
  sdcFile?: string;
  clockPeriodNs?: number;
  platform?: PlatformPaths;
}

export function generatePowerTcl(
  options: PowerScriptOptions,
  defaultPlatform: PlatformPaths
): string {
  const plat = options.platform || defaultPlatform;

  let sdcCommands = '';
  if (options.sdcFile) {
    sdcCommands = `read_sdc "${options.sdcFile}"`;
  } else if (options.clockPeriodNs) {
    sdcCommands = `
create_clock [all_inputs] -name core_clock -period ${options.clockPeriodNs}
`;
  }

  return `
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_def "${options.defFile}"

${sdcCommands}

report_power
puts "POWER_COMPLETE"
`;
}
