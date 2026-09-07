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
  };
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

global_placement -density ${placeDensity}
detailed_placement

global_route
${options.detailRoute ? "detailed_route" : ""}

estimate_parasitics -placement
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

clock_tree_synthesis

estimate_parasitics -placement
report_wns
report_tns

write_def "${outputDef}"
puts "CTS_COMPLETE: ${outputDef}"
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
