// app/api/mcp/route.ts
//
// A remote MCP server exposing this store's data to MCP-capable AI clients
// (Claude, etc.), authenticated the same way the REST API is — an
// `Authorization: Bearer <key>` header, checked via requireApiKey.
//
// Deliberately read + create only for now — no update/delete tools are
// registered. An AI agent acting on injected or misleading instructions is
// the sharpest realistic risk here, and the cheapest mitigation is simply
// not exposing destructive tools until there's a human-confirmation
// mechanism worth building.
//
// A fresh McpServer + transport is built per request rather than reused
// across invocations — deliberate, not wasteful: Vercel's serverless model
// gives no guarantee two requests share memory, and reusing one instance
// across different callers' concurrent API keys would risk leaking state
// between tenants.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { requireApiKey } from "@/lib/auth/api-key";
import { PERMISSIONS } from "@/lib/permissions";
import {
  getCustomersCore,
  getCustomerByIdCore,
  createCustomerCore,
} from "@/lib/core/customer";

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function buildServer(request: Request) {
  const server = new McpServer({ name: "jewelry-erp", version: "1.0.0" });

  server.tool(
    "list_customers",
    "List customers for the authenticated store, with optional search and pagination.",
    {
      search: z.string().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
    async (args) => {
      try {
        const auth = await requireApiKey(request, PERMISSIONS.CUSTOMER_VIEW);
        const result = await getCustomersCore(args, auth.storeId);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "get_customer",
    "Get a single customer by id.",
    { id: z.string() },
    async ({ id }) => {
      try {
        const auth = await requireApiKey(request, PERMISSIONS.CUSTOMER_VIEW);
        const customer = await getCustomerByIdCore(id, auth.storeId);
        if (!customer) {
          return { content: [{ type: "text" as const, text: "Customer not found" }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(customer) }] };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "create_customer",
    "Create a new customer. Name and phone are required; every other field is optional.",
    {
      name: z.string(),
      phone: z.string(),
      altPhone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pincode: z.string().optional(),
      gstNumber: z.string().optional(),
      panNumber: z.string().optional(),
      registrationId: z.string().optional(),
      notes: z.string().optional(),
      openingBalance: z.number().optional(),
    },
    async (input) => {
      try {
        const auth = await requireApiKey(request, PERMISSIONS.CUSTOMER_CREATE);
        const result = await createCustomerCore(input, {
          storeId: auth.storeId,
          actorId: auth.actorId,
          actorName: auth.actorName,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          isError: !result.success,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

async function handle(request: Request): Promise<Response> {
  const server = buildServer(request);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
