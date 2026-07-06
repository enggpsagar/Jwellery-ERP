import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/auth";

export async function GET() {
  try {
    const user = await requireAuth();

    const profile = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,

        role: true,
        status: true,
        createdAt: true,

        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        pincode: true,
        country: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(profile);
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sessionUser = await requireAuth();

    const body = await req.json();

    const user = await prisma.user.findUnique({
      where: {
        id: sessionUser.id,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: "User not found",
        },
        {
          status: 404,
        }
      );
    }

    // Email can only be set once
    let email = user.email;

    if (!user.email && body.email) {
      const exists = await prisma.user.findUnique({
        where: {
          email: body.email,
        },
      });

      if (exists) {
        return NextResponse.json(
          {
            message: "Email already exists.",
          },
          {
            status: 400,
          }
        );
      }

      email = body.email;
    }

    const updated = await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        name: body.name,
        phone: body.phone,

        email,

        image: body.image,

        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,

        city: body.city,
        state: body.state,
        pincode: body.pincode,
        country: body.country,
      },

      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,

        role: true,
        status: true,

        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        pincode: true,
        country: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Unable to update profile.",
      },
      {
        status: 500,
      }
    );
  }
}