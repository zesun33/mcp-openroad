import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolRunner } from './runner.js';
import { handleOpenroadPnr, openroadPnrSchema } from './tools/pnr.js';
import { handleOpenroadFloorplan, openroadFloorplanSchema } from './tools/floorplan.js';
import { handleOpenroadPlace, openroadPlaceSchema } from './tools/place.js';
import { handleOpenroadRoute, openroadRouteSchema } from './tools/route.js';
import { handleOpenroadSta, openroadStaSchema } from './tools/sta.js';
import { handleOpenroadToolchainInfo, openroadToolchainInfoSchema } from './tools/toolchain.js';
import { handleOpenroadCts, openroadCtsSchema } from './tools/cts.js';
import { handleOpenroadDetailRoute, openroadDetailRouteSchema } from './tools/detail_route.js';
import { handleOpenroadStaCorners, openroadStaCornersSchema } from './tools/sta_corners.js';
import { handleOpenroadPower, openroadPowerSchema } from './tools/power.js';
import { handleOpenroadPdn, openroadPdnSchema } from './tools/pdn.js';
import { handleOpenroadEval, openroadEvalSchema } from './tools/eval.js';

export function createServer(): Server {
  const runner = new ToolRunner();

  const server = new Server(
    {
      name: '@zesun33/mcp-openroad',
      version: '0.2.4',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const tools: Tool[] = [
    {
      name: 'openroad_pnr',
      description:
        'Performs end-to-end automated digital ASIC physical design (floorplanning, placement, routing, and static timing analysis) on a gate-level netlist using OpenROAD, returning area, utilization, wirelength, and timing slack metrics.',
      inputSchema: {
        type: 'object',
        properties: {
          netlist_file: {
            type: 'string',
            description: 'Gate-level Verilog netlist file path.',
          },
          top_module: {
            type: 'string',
            description: 'Name of the top-level module to place and route.',
          },
          sdc_file: {
            type: 'string',
            description: 'Optional SDC timing constraints file path.',
          },
          clock_period_ns: {
            type: 'number',
            description: 'Target clock period in ns if no SDC provided (default: 1.0).',
          },
          core_utilization: {
            type: 'number',
            description: 'Target core cell placement density from 0.0 to 1.0 (default: 0.7).',
          },
          output_def: {
            type: 'string',
            description: 'Optional output routed DEF file path.',
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory where source files reside.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 45000).',
          },
          pdn: {
            type: 'boolean',
            description:
              'Insert stdcell PDN after floorplan/tap and before place (Sky130 only; default false).',
          },
        },
        required: ['netlist_file', 'top_module'],
      },
    },
    {
      name: 'openroad_floorplan',
      description:
        'Initializes ASIC floorplan boundaries, core/die sizing, and I/O pin placement using OpenROAD, generating a floorplan DEF file.',
      inputSchema: {
        type: 'object',
        properties: {
          netlist_file: {
            type: 'string',
            description: 'Gate-level Verilog netlist file path.',
          },
          top_module: {
            type: 'string',
            description: 'Name of the top-level module.',
          },
          die_width: {
            type: 'number',
            description: 'Die width in microns (default: 60).',
          },
          die_height: {
            type: 'number',
            description: 'Die height in microns (default: 60).',
          },
          core_margin: {
            type: 'number',
            description: 'Margin between die and core in microns (default: 5).',
          },
          output_def: {
            type: 'string',
            description: 'Output floorplan DEF file path.',
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds.',
          },
        },
        required: ['netlist_file', 'top_module'],
      },
    },
    {
      name: 'openroad_place',
      description:
        'Performs standard cell global analytical placement (RePLace) and legalized detailed placement (DPL) on a floorplan DEF file.',
      inputSchema: {
        type: 'object',
        properties: {
          floorplan_def: {
            type: 'string',
            description: 'Floorplan DEF file path.',
          },
          top_module: {
            type: 'string',
            description: 'Name of the top-level module.',
          },
          density: {
            type: 'number',
            description: 'Target placement density (default: 0.4).',
          },
          output_def: {
            type: 'string',
            description: 'Output placed DEF file path.',
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds.',
          },
        },
        required: ['floorplan_def', 'top_module'],
      },
    },
    {
      name: 'openroad_route',
      description:
        'Performs global routing (FastRoute) on a placed DEF file, reporting wirelength estimates. Use openroad_detail_route afterwards for detailed routing with DRC reporting.',
      inputSchema: {
        type: 'object',
        properties: {
          placed_def: {
            type: 'string',
            description: 'Placed DEF file path.',
          },
          top_module: {
            type: 'string',
            description: 'Name of the top-level module.',
          },
          output_def: {
            type: 'string',
            description: 'Output routed DEF file path.',
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds.',
          },
        },
        required: ['placed_def', 'top_module'],
      },
    },
    {
      name: 'openroad_sta',
      description:
        'Performs static timing analysis using OpenSTA on placed or routed DEF files, reporting Worst Negative Slack (WNS), Total Negative Slack (TNS), and critical paths.',
      inputSchema: {
        type: 'object',
        properties: {
          def_file: {
            type: 'string',
            description: 'DEF file path (placed or routed).',
          },
          top_module: {
            type: 'string',
            description: 'Name of the top-level module.',
          },
          sdc_file: {
            type: 'string',
            description: 'Optional SDC timing constraints file path.',
          },
          clock_period_ns: {
            type: 'number',
            description: 'Target clock period in ns (default: 1.0).',
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds.',
          },
        },
        required: ['def_file', 'top_module'],
      },
    },
    {
      name: 'openroad_cts',
      description:
        'Runs clock tree synthesis (CTS) on a placed DEF file, reporting inserted clock buffers/nets and post-CTS timing slack.',
      inputSchema: {
        type: 'object',
        properties: {
          placed_def: { type: 'string', description: 'Placed DEF file path (output of openroad_place).' },
          top_module: { type: 'string', description: 'Name of the top-level module.' },
          sdc_file: { type: 'string', description: 'Optional SDC timing constraints file path.' },
          clock_period_ns: { type: 'number', description: 'Target clock period in ns if no SDC provided (default: 1.0).' },
          output_def: { type: 'string', description: 'Output CTS DEF file path.' },
          cwd: { type: 'string', description: 'Optional working directory.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds.' },
        },
        required: ['placed_def', 'top_module'],
      },
    },
    {
      name: 'openroad_detail_route',
      description:
        'Runs detailed routing on a globally-routed DEF file and reports DRC issue counts with samples. Completes even with findings; check drcIssues before signoff.',
      inputSchema: {
        type: 'object',
        properties: {
          routed_def: { type: 'string', description: 'Globally-routed DEF file path (output of openroad_route).' },
          top_module: { type: 'string', description: 'Name of the top-level module.' },
          output_def: { type: 'string', description: 'Output detail-routed DEF file path.' },
          cwd: { type: 'string', description: 'Optional working directory.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds.' },
        },
        required: ['routed_def', 'top_module'],
      },
    },
    {
      name: 'openroad_sta_corners',
      description:
        'Runs static timing analysis across multiple Liberty corners (one .lib per corner) on a DEF file, reporting per-corner WNS/TNS plus the worst corner.',
      inputSchema: {
        type: 'object',
        properties: {
          def_file: { type: 'string', description: 'DEF file path (placed or routed).' },
          top_module: { type: 'string', description: 'Name of the top-level module.' },
          liberty_files: { type: 'array', items: { type: 'string' }, description: 'Liberty (.lib) files, one per corner.' },
          corner_names: { type: 'array', items: { type: 'string' }, description: 'Optional corner labels matching liberty_files order.' },
          sdc_file: { type: 'string', description: 'Optional SDC timing constraints file path.' },
          clock_period_ns: { type: 'number', description: 'Target clock period in ns (default: 1.0).' },
          cwd: { type: 'string', description: 'Optional working directory.' },
          timeout_ms: { type: 'number', description: 'Timeout per corner in milliseconds.' },
        },
        required: ['def_file', 'top_module', 'liberty_files'],
      },
    },
    {
      name: 'openroad_power',
      description:
        'Reports power (total/internal/switching/leakage watts plus per-group breakdown) for a placed or routed DEF via OpenSTA report_power. True IR-drop needs PSM, absent in OpenROAD 2.0.',
      inputSchema: {
        type: 'object',
        properties: {
          def_file: { type: 'string', description: 'DEF file path (placed or routed).' },
          top_module: { type: 'string', description: 'Name of the top-level module.' },
          sdc_file: { type: 'string', description: 'Optional SDC timing constraints file path.' },
          clock_period_ns: { type: 'number', description: 'Target clock period in ns (default: 1.0).' },
          cwd: { type: 'string', description: 'Optional working directory.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds.' },
        },
        required: ['def_file', 'top_module'],
      },
    },
    {
      name: 'openroad_pdn',
      description:
        'Inserts a stdcell power grid (followpins rails + upper-layer straps). Sky130 only. The step tool takes a placed DEF; inside openroad_pnr, PDN runs after floorplan/tap and before place so GPL sees straps. Platforms without PDN config error honestly.',
      inputSchema: {
        type: 'object',
        properties: {
          placed_def: { type: 'string', description: 'Placed DEF file path (after openroad_place / tapcells).' },
          top_module: { type: 'string', description: 'Name of the top-level module.' },
          output_def: { type: 'string', description: 'Output DEF with PDN straps.' },
          platform: { type: 'string', description: "Process platform (use 'sky130'; nangate45 errors honestly)." },
          cwd: { type: 'string', description: 'Optional working directory.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds.' },
        },
        required: ['placed_def', 'top_module'],
      },
    },
    {
      name: 'openroad_eval',
      description:
        'Evaluates a Tcl snippet in a fresh stateless OpenROAD session and returns capped stdout. Include any read_lef/read_liberty/read_def setup the query needs; no state persists between calls.',
      inputSchema: {
        type: 'object',
        properties: {
          tcl: { type: 'string', description: 'Tcl snippet to evaluate (max 8000 chars).' },
          cwd: { type: 'string', description: 'Optional working directory.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds.' },
        },
        required: ['tcl'],
      },
    },
    {
      name: 'openroad_toolchain_info',
      description:
        'Returns active container/host runtime and version information for OpenROAD, OpenSTA, and supported platform PDKs.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Optional workspace directory.',
          },
        },
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      if (name === 'openroad_pnr') {
        const parsedArgs = openroadPnrSchema.parse(args);
        return await handleOpenroadPnr(runner, parsedArgs);
      }

      if (name === 'openroad_floorplan') {
        const parsedArgs = openroadFloorplanSchema.parse(args);
        return await handleOpenroadFloorplan(runner, parsedArgs);
      }

      if (name === 'openroad_place') {
        const parsedArgs = openroadPlaceSchema.parse(args);
        return await handleOpenroadPlace(runner, parsedArgs);
      }

      if (name === 'openroad_route') {
        const parsedArgs = openroadRouteSchema.parse(args);
        return await handleOpenroadRoute(runner, parsedArgs);
      }

      if (name === 'openroad_sta') {
        const parsedArgs = openroadStaSchema.parse(args);
        return await handleOpenroadSta(runner, parsedArgs);
      }

      if (name === 'openroad_cts') {
        const parsedArgs = openroadCtsSchema.parse(args);
        return await handleOpenroadCts(runner, parsedArgs);
      }

      if (name === 'openroad_detail_route') {
        const parsedArgs = openroadDetailRouteSchema.parse(args);
        return await handleOpenroadDetailRoute(runner, parsedArgs);
      }

      if (name === 'openroad_sta_corners') {
        const parsedArgs = openroadStaCornersSchema.parse(args);
        return await handleOpenroadStaCorners(runner, parsedArgs);
      }

      if (name === 'openroad_power') {
        const parsedArgs = openroadPowerSchema.parse(args);
        return await handleOpenroadPower(runner, parsedArgs);
      }

      if (name === 'openroad_pdn') {
        const parsedArgs = openroadPdnSchema.parse(args);
        return await handleOpenroadPdn(runner, parsedArgs);
      }

      if (name === 'openroad_eval') {
        const parsedArgs = openroadEvalSchema.parse(args);
        return await handleOpenroadEval(runner, parsedArgs);
      }

      if (name === 'openroad_toolchain_info') {
        const parsedArgs = openroadToolchainInfoSchema.parse(args);
        return await handleOpenroadToolchainInfo(runner, parsedArgs);
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }],
        isError: true,
      };
    }
  });

  return server;
}
