export interface PlatformPaths {
  techLef: string;
  macroLef: string;
  liberty: string;
  siteName: string;
}

export function getDefaultPlatformPaths(): PlatformPaths {
  return {
    techLef: '/opt/platforms/nangate45/NangateOpenCellLibrary.tech.lef',
    macroLef: '/opt/platforms/nangate45/NangateOpenCellLibrary.macro.lef',
    liberty: '/opt/platforms/nangate45/NangateOpenCellLibrary_typical.lib',
    siteName: 'FreePDK45_38x28_10R_NP_162NW_34O',
  };
}

export interface PnrScriptOptions {
  netlistFile: string;
  topModule: string;
  sdcFile?: string;
  clockPeriodNs?: number;
  coreUtilization?: number;
  outputDef?: string;
  platform?: PlatformPaths;
}

export function generatePnrTcl(options: PnrScriptOptions, defaultPlatform: PlatformPaths): string {
  const plat = options.platform || defaultPlatform;
  const util = options.coreUtilization ?? 0.4;
  const outputDef = options.outputDef || `${options.topModule}_pnr.def`;

  let sdcCommands = '';
  if (options.sdcFile) {
    sdcCommands = `read_sdc "${options.sdcFile}"`;
  } else if (options.clockPeriodNs) {
    sdcCommands = `
current_design "${options.topModule}"
create_clock [all_inputs] -name core_clock -period ${options.clockPeriodNs}
`;
  }

  return `
# Auto-generated OpenROAD PnR Script
read_lef "${plat.techLef}"
read_lef "${plat.macroLef}"
read_liberty "${plat.liberty}"

read_verilog "${options.netlistFile}"
link_design "${options.topModule}"

${sdcCommands}

initialize_floorplan -site "${plat.siteName}" -die_area "0 0 60 60" -core_area "5 5 55 55"
make_tracks
place_pins -hor_layer metal3 -ver_layer metal2

global_placement -density ${util}
detailed_placement

global_route

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
place_pins -hor_layer metal3 -ver_layer metal2

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
  const density = options.density ?? 0.4;
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
