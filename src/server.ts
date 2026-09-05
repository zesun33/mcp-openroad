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

export function createServer(): Server {
  const runner = new ToolRunner();

  const server = new Server(
    {
      name: '@zesun33/mcp-openroad',
      version: '0.1.0',
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
            description: 'Target core cell placement density from 0.0 to 1.0 (default: 0.4).',
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
        'Performs global routing (FastRoute) and detailed routing on a placed DEF file, reporting wirelength and DRC violation metrics.',
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
