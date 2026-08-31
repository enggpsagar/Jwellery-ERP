import { NextResponse } from "next/server";

import { requireApiKey } from "@/lib/auth/api-key";
import { PERMISSIONS } from "@/lib/permissions";
import { getCustomerByIdCore, updateCustomerCore } from "@/lib/core/customer";
import { customerUpdateSchema } from "@/lib/validation/customer";
import { apiError, apiErrorFromException } from "@/lib/api/respond";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await requireApiKey(request, PERMISSIONS.CUSTOMER_VIEW);
    const { id } = await params;

    const customer = await getCustomerByIdCore(id, auth.storeId);
    if (!customer) {
      return apiError("NOT_FOUND", "Customer not found", 404);
    }

    return NextResponse.json({ customer });
  } catch (error) {
    return apiErrorFromException(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireApiKey(request, PERMISSIONS.CUSTOMER_UPDATE);
    const { id } = await params;

    const body = await request.json();
    const input = customerUpdateSchema.parse(body);

    const result = await updateCustomerCore(id, input, auth.storeId);

    if (result.success) {
      return NextResponse.json({ success: true, message: result.message });
    }

    if (result.message === "Customer not found") {
      return apiError("NOT_FOUND", result.message, 404);
    }

    if (result.errors) {
      return apiError("VALIDATION_ERROR", result.message, 422, result.errors);
    }

    return apiError("INTERNAL_ERROR", result.message, 500);
  } catch (error) {
    return apiErrorFromException(error);
  }
}
