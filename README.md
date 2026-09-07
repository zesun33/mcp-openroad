# @zesun33/mcp-openroad

> Model Context Protocol (MCP) server for open-source digital ASIC physical design (place-and-route) and static timing analysis via [OpenROAD](https://theopenroadproject.org/).

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/zesun33/mcp-openroad/actions/workflows/ci.yml/badge.svg)](https://github.com/zesun33/mcp-openroad/actions/workflows/ci.yml)
[![Protocol: MCP](https://img.shields.io/badge/protocol-MCP_stdio-blueviolet)](https://modelcontextprotocol.io)
[![Runtime: Rootless Podman](https://img.shields.io/badge/runtime-rootless_podman-brightgreen)](#execution-runtime)
[![Version](https://img.shields.io/badge/version-0.2.3-informational)](./package.json)

`mcp-openroad` equips AI coding agents and IDEs (**Cursor**, **Windsurf**, **GitHub Copilot / OpenAI Codex**, **Claude Code**, **Google Antigravity**, **OpenCode**, **Cline**) with structured tools to execute physical design (P&R) flows over standard cell netlists. It automates floorplanning, analytical cell placement, clock tree synthesis (CTS), global/detailed routing, and static timing analysis (STA), transforming verbose multi-thousand-line terminal logs into clean, low-token JSON metrics (`< 150 tokens`).

---

## ⚡ Quick Tour: See It in Action

### Why AI Agents Need `mcp-openroad`

| Without `mcp-openroad` (Raw OpenROAD CLI) | With `mcp-openroad` (Structured MCP) |
| :--- | :--- |
| Dumps 10,000+ lines of raw C++ log output into LLM context | Clean structured JSON with **`< 150 tokens`** of exact metrics |
| Timing slack (WNS/TNS) buried deep in STA reports | Direct **`timingMet`**, **`wns`**, and **`criticalPath`** summary |
| Manual setup of tech LEFs, cell LEFs, and timing libraries | **Zero-config bundled platform** (Nangate45 + Sky130 support) |
| Host installation requires complex C++ dependencies and conda | **Isolated rootless Podman** (`ghcr.io/zesun33/asic`) |
| Unplaced cells and DRC shorts require visual inspection | Pinpointed **DRC counts**, **HPWL**, and **displacement** metrics |

### Real Agent Scenarios in 60 Seconds

#### 1. Probing the Environment (Zero-Config Verification)

```json
// Tool Call: openroad_toolchain_info
{
  "runtime": "podman",
  "image": "ghcr.io/zesun33/asic",
  "openroadVersion": "2.0-12381-g01bba3695",
  "staVersion": "OpenSTA 2.6.0",
  "platforms": ["nangate45", "sky130"]
}
```

#### 2. Automated Floorplanning & I/O Pin Placement (200ms)

```json
// Tool Call: openroad_floorplan {"netlist_file": "counter_netlist.v", "top_module": "counter", "die_width": 50, "die_height": 50}
{
  "success": true,
  "dieArea": { "llx": 0, "lly": 0, "urx": 50, "ury": 50, "width": 50, "height": 50 },
  "coreArea": { "llx": 5.13, "lly": 5.6, "urx": 44.84, "ury": 44.8, "width": 39.71, "height": 39.2 },
  "pinsPlaced": 6,
  "defFile": "counter_fp.def"
}
```

#### 3. End-to-End P&R and Static Timing Closure (400ms)

#### 4. Clock Tree Synthesis on a Placed DEF
```json
// Tool Call: openroad_cts {"placed_def": "counter_placed.def", "top_module": "counter", "clock_period_ns": 1.0}
{
  "success": true,
  "clockBuffers": 3,
  "clockNets": 3,
  "timing": { "timingMet": true, "wns": 0.0, "tns": 0.0 }
}
```

#### 5. Power Breakdown Without Leaving the Agent Loop
```json
// Tool Call: openroad_power {"def_file": "counter_placed.def", "top_module": "counter"}
{
  "success": true,
  "totalW": 5.23e-05,
  "breakdown": { "sequential": 3.28e-05, "clock": 1.84e-05 }
}
```

#### 6. Stdcell PDN (step tool on a placed DEF)

Inside `openroad_pnr`, PDN runs after floorplan/tap and **before place**. The standalone `openroad_pdn` tool still accepts a placed DEF.
```json
// Tool Call: openroad_pdn {"placed_def": "counter_placed.def", "top_module": "counter", "platform": "sky130"}
{
  "success": true,
  "grid": "grid",
  "defFile": "counter_pdn.def"
}
```

```json
// Tool Call: openroad_pnr {"netlist_file": "counter_netlist.v", "top_module": "counter", "clock_period_ns": 1.0}
{
  "success": true,
  "topModule": "counter",
  "platform": "nangate45",
  "cellCount": 13,
  "utilization": 1.93,
  "hpwl": 106.6,
  "timing": {
    "timingMet": true,
    "wns": 0.0,
    "tns": 0.0,
    "clockPeriod": 1.0
  },
  "defFile": "counter_routed.def",
  "warnings": [],
  "errors": []
}
```

---

## Tools Exposed

| Tool | Parameters | Engine | Description |
| :--- | :--- | :--- | :--- |
| `openroad_pnr` | `netlist_file: string`<br>`top_module: string`<br>`sdc_file?: string`<br>`clock_period_ns?: number`<br>`core_utilization?: number`<br>`platform?: "nangate45" \| "sky130"`<br>`detail_route?: boolean`<br>`tapcells?: boolean`<br>`fillers?: boolean`<br>`pdn?: boolean`<br>`cts?: boolean`<br>`output_def?: string`<br>`cwd?: string` | OpenROAD Full Flow | Automated end-to-end physical design (floorplanning, placement, routing, and STA) returning area, utilization, wirelength, and timing slack metrics. `platform: "sky130"` routes on `sky130_fd_sc_hd` (tt corner, `unithd` site) via a host-side volare PDK (`MCP_OPENROAD_PDK_ROOT`, mounted at `/pdk`); without it the tool errors honestly. All step tools (`floorplan`, `place`, `route`, `sta`, `cts`, `detail_route`, `power`, `pdn`) accept the same `platform` param. `detail_route: true` runs detailed routing inside `openroad_pnr` (default false, global-route-only); Sky130 LVS needs it. `tapcells`/`fillers` insert well-tap/endcap (`tap_1`/`decap_4`, distance 14) and filler/decap cells on Sky130. `pdn: true` inserts a stdcell power grid (met1 followpins + met4/met5 straps, ORFS-class pitch 56 µm) after floorplan/tap and **before place** so GPL sees straps; nangate45 errors honestly. `cts: true` runs TritonCTS after place (`clkbuf_16/8/4` on Sky130) then legalizes before `global_route`. `openroad_pnr` fails if `detail_route` wrote 0 signal wires. |
| `openroad_floorplan` | `netlist_file: string`<br>`top_module: string`<br>`die_width?: number`<br>`die_height?: number`<br>`core_margin?: number`<br>`output_def?: string`<br>`cwd?: string` | `initialize_floorplan`, `place_pins` | Initializes ASIC floorplan boundaries, core/die sizing, and I/O pin placement, generating a floorplan DEF file. |
| `openroad_place` | `floorplan_def: string`<br>`top_module: string`<br>`density?: number`<br>`output_def?: string`<br>`cwd?: string` | `global_placement`, `detailed_placement` | Performs standard cell global analytical placement (RePLace) and legalized detailed placement (DPL). |
| `openroad_route` | `placed_def: string`<br>`top_module: string`<br>`output_def?: string`<br>`cwd?: string` | `global_route` | Performs global routing (FastRoute) on a placed DEF, reporting wirelength estimates. Follow with `openroad_detail_route` for DRC reporting. |
| `openroad_sta` | `def_file: string`<br>`top_module: string`<br>`sdc_file?: string`<br>`clock_period_ns?: number`<br>`cwd?: string` | OpenSTA | Performs static timing analysis on placed or routed DEF files, reporting Worst Negative Slack (WNS), Total Negative Slack (TNS), and critical paths. |
| `openroad_cts` | `placed_def: string`<br>`top_module: string`<br>`sdc_file?: string`<br>`clock_period_ns?: number`<br>`output_def?: string`<br>`cwd?: string` | `clock_tree_synthesis` | Runs CTS on a placed DEF, reporting inserted clock buffers/nets and post-CTS timing. |
| `openroad_detail_route` | `routed_def: string`<br>`top_module: string`<br>`output_def?: string`<br>`cwd?: string` | `detailed_route` | Runs detailed routing with honest DRC issue counts and samples (completes with findings; check `drcIssues`). Reports `routedWires` with a warning when zero (e.g. CTS pin-access failures route nothing). |
| `openroad_sta_corners` | `def_file: string`<br>`top_module: string`<br>`liberty_files: string[]`<br>`corner_names?: string[]`<br>`sdc_file?: string`<br>`clock_period_ns?: number`<br>`cwd?: string` | OpenSTA | STA across Liberty corners with per-corner WNS/TNS plus the worst corner. |
| `openroad_power` | `def_file: string`<br>`top_module: string`<br>`sdc_file?: string`<br>`clock_period_ns?: number`<br>`cwd?: string` | `report_power` | Power totals plus per-group breakdown. True IR-drop needs PSM (absent in OpenROAD 2.0). |
| `openroad_pdn` | `placed_def: string`<br>`top_module: string`<br>`output_def?: string`<br>`cwd?: string` | `pdngen` | Inserts a Sky130 stdcell power grid (VPWR/VGND global connections, met1 followpins, met4/met5 straps). The step tool still takes a placed DEF. Inside `openroad_pnr`, PDN runs after floorplan/tap and **before place** (ORFS order) so cells are not parked under straps — post-place PDN + CTS was DRT-0073 on clkbuf pins. Nangate45 errors honestly. |
| `openroad_eval` | `tcl: string`<br>`cwd?: string` | `openroad -exit` | Stateless single-shot Tcl eval with capped stdout; include setup in the snippet. |
| `openroad_toolchain_info` | `cwd?: string` | Probe | Returns container/host runtime and version information for OpenROAD, OpenSTA, and supported platform PDKs. |

---

## Execution Runtime

`mcp-openroad` runs inside the [`zesun33/asic`](https://github.com/zesun33/eda-docker-images) rootless Podman image so tools are identical on any Linux host.

**Public install (recommended — anyone can pull):**
```bash
podman pull ghcr.io/zesun33/asic:latest
export MCP_OPENROAD_IMAGE=ghcr.io/zesun33/asic
```

Local builds from `eda-docker-images` still work as `localhost/zesun33/asic` (the historical default). Override anytime with `MCP_OPENROAD_IMAGE`.

- Container mount: `-v <workspace>:/workspace:Z -w /workspace`
- Podman storage option: `--storage-opt overlay.ignore_chown_errors=true`

To force host binaries instead of container execution:
```bash
export MCP_OPENROAD_RUNTIME=host
```

For Sky130, set `MCP_OPENROAD_PDK_ROOT` to a host volare cache (mounted at `/pdk`).

---

## Client Configuration

To register `mcp-openroad` with your AI IDE or agent, add it to your configuration file (e.g., `.cursor/mcp.json`, `claude_desktop_config.json`, or Windsurf settings):

```json
{
  "mcpServers": {
    "openroad": {
      "command": "node",
      "args": ["/path/to/mcp-openroad/dist/index.js"],
      "env": {
        "MCP_OPENROAD_RUNTIME": "podman",
        "MCP_OPENROAD_IMAGE": "ghcr.io/zesun33/asic"
      }
    }
  }
}
```

### Universal Compatibility

Works out-of-the-box across all modern AI coding environments:
- **Cursor**: Configure in `.cursor/mcp.json`.
- **Windsurf**: Configure in `~/.codeium/windsurf/mcp_config.json`.
- **GitHub Copilot / OpenAI Codex**: Configure via Copilot MCP settings or Codex tool proxy.
- **Claude Code**: Configure via `claude mcp add openroad node /path/to/dist/index.js`.
- **Google Antigravity**: Load as workspace MCP server in `antigravity.json`.
- **OpenCode & Cline**: Direct stdio JSON-RPC connection.

---

## Verification & Testing

Strict 6-gate verification suite matching the portfolio engineering standard:

```bash
# Full verification (all 6 gates with Podman integration)
./scripts/verify.sh

# Fast / CI verification (headless environments)
./scripts/verify.sh --quick

# Target specific gates
./scripts/verify.sh --gate 1   # Spec lock & package integrity
./scripts/verify.sh --gate 2   # Static build (TypeScript)
./scripts/verify.sh --gate 3   # Unit tests (parsers & schema contract)
./scripts/verify.sh --gate 4   # Live Podman container integration tests
./scripts/verify.sh --gate 5   # Stdio JSON-RPC contract check
./scripts/verify.sh --gate 6   # Documentation validation
```

---

## License

Apache-2.0 © 2026 Md Zesun Ahmed Mia
