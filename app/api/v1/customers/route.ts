import { NextResponse } from "next/server";

import { requireApiKey } from "@/lib/auth/api-key";
import { PERMISSIONS } from "@/lib/permissions";
import { getCustomersCore, createCustomerCore } from "@/lib/core/customer";
import { customerInputSchema, customerListQuerySchema } from "@/lib/validation/customer";
import { apiError, apiErrorFromException } from "@/lib/api/respond";

export async function GET(request: Request) {
  try {
    const auth = await requireApiKey(request, PERMISSIONS.CUSTOMER_VIEW);

    const { searchParams } = new URL(request.url);
    const query = customerListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
    });

    const result = await getCustomersCore(query, auth.storeId);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorFromException(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiKey(request, PERMISSIONS.CUSTOMER_CREATE);

    const body = await request.json();
    const input = customerInputSchema.parse(body);

    const result = await createCustomerCore(input, {
      storeId: auth.storeId,
      actorId: auth.actorId,
      actorName: auth.actorName,
    });

    if (result.success) {
      return NextResponse.json({ customer: result.customer }, { status: 201 });
    }

    if (result.errors) {
      return apiError("VALIDATION_ERROR", result.message, 422, result.errors);
    }

    return apiError("INTERNAL_ERROR", result.message, 500);
  } catch (error) {
    return apiErrorFromException(error);
  }
}
