"use server";

import { StorePlanAction, UserRole, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { APP_NAME } from "@/lib/constants/app";
import { newStoreRegisteredEmail, storeWelcomeEmail } from "@/lib/email-templates";
import { buildUniqueStoreCode } from "@/lib/store-code";

export type RegisterStoreState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  /** Set on success so the page can tell the user how to sign in. */
  signInWith?: { email: string | null; phone: string | null };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Starter taxonomy for a brand-new store.
 *
 * Without this a self-registered store opens completely empty: no metals
 * means no product can be given one, and stock entry now requires the
 * product to carry a metal — so "register and explore" would dead-end on the
 * first thing anyone tries. These are starting points, all renameable under
 * Settings → Taxonomy.
 */
const STARTER_METALS = [
  { name: "Gold", hasPurity: true },
  { name: "Silver", hasPurity: true },
  { name: "Diamond", hasPurity: false },
  { name: "Other", hasPurity: false },
];

const STARTER_CATEGORIES: { name: string; types: string[] }[] = [
  {
    name: "Ornament",
    types: ["Ring", "Chain", "Necklace", "Bangle", "Earring", "Bracelet", "Pendant"],
  },
  { name: "Coin", types: ["Gold Coin", "Silver Coin"] },
  { name: "Bar", types: ["Bar"] },
  { name: "Loose Stone", types: ["Loose Stone"] },
];

/**
 * The store's code, built from state + area + name (see lib/store-code).
 *
 * Every existing code is loaded rather than a prefix-filtered subset: the
 * uniqueness check has to be against the whole set, and there are few enough
 * stores that reading them all is cheaper than being subtly wrong.
 */
async function generateStoreCode(parts: {
  name: string;
  state: string | null;
  area: string | null;
}): Promise<string> {
  const taken = (
    await prisma.store.findMany({ select: { code: true } })
  ).map((store) => store.code);

  return buildUniqueStoreCode(parts, taken);
}

/**
 * The plan a new store starts on: the cheapest active one, which is the free
 * trial. Chosen by price rather than by name so renaming "30 Days – Free
 * Trial" in the admin UI doesn't silently leave new stores with no plan.
 */
async function resolveTrialPlan() {
  return prisma.plan.findFirst({
    where: { isActive: true },
    orderBy: [{ price: "asc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, durationDays: true, price: true },
  });
}

/**
 * Self-service store registration. Deliberately unauthenticated — this is how
 * a new shop gets in.
 *
 * Creating an account for an unverified email is safe here because it grants
 * nothing on its own: every sign-in path proves ownership first. Google
 * requires the mailbox, and the OTP path emails or texts a code. Someone
 * registering with an address they don't control simply cannot sign in.
 *
 * The account is created ACTIVE but with status INVITED, matching how an
 * admin-created user starts.
 */
export async function registerStoreAction(
  _prevState: RegisterStoreState,
  formData: FormData,
): Promise<RegisterStoreState> {
  try {
    const storeName = String(formData.get("storeName") || "").trim();
    const ownerName = String(formData.get("ownerName") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();

    const errors: Record<string, string[]> = {};

    if (!storeName) errors.storeName = ["Store name is required"];
    if (!ownerName) errors.ownerName = ["Your name is required"];
    if (!email) errors.email = ["Email is required"];
    else if (!EMAIL_RE.test(email)) errors.email = ["Enter a valid email address"];
    if (!phone) errors.phone = ["Mobile number is required"];
    // State and city are required because the store code is derived from
    // them and can never be changed afterwards — collecting them later would
    // be too late to affect the code.
    if (!state) errors.state = ["State is required"];
    if (!city) errors.city = ["City or area is required"];

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the highlighted fields.", errors };
    }

    // Email and phone are globally-unique sign-in identifiers. Checked up
    // front so the message names the field that collided, rather than
    // surfacing a raw unique-constraint error.
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { email: true, phone: true },
    });

    if (existing) {
      const field = existing.email === email ? "email" : "phone";
      return {
        success: false,
        message:
          field === "email"
            ? "That email already has an account. Sign in instead."
            : "That mobile number already has an account. Sign in instead.",
        errors: { [field]: ["Already registered"] },
      };
    }

    const [code, plan] = await Promise.all([
      generateStoreCode({ name: storeName, state, area: city }),
      resolveTrialPlan(),
    ]);

    const store = await prisma.$transaction(async (tx) => {
      const createdStore = await tx.store.create({
        data: {
          name: storeName,
          code,
          email,
          phone,
          city: city || null,
          state: state || null,
          ...(plan
            ? {
                planId: plan.id,
                planStartedAt: new Date(),
                planExpiresAt: new Date(
                  Date.now() + plan.durationDays * 24 * 60 * 60 * 1000,
                ),
              }
            : {}),
        },
      });

      // Opens the subscription ledger, so a self-registered store's history
      // starts at its trial rather than at whatever a Super Admin does next.
      if (plan) {
        await tx.storePlanHistory.create({
          data: {
            storeId: createdStore.id,
            planId: plan.id,
            planName: plan.name,
            price: plan.price,
            durationDays: plan.durationDays,
            startedAt: createdStore.planStartedAt ?? new Date(),
            expiresAt: createdStore.planExpiresAt ?? new Date(),
            action: StorePlanAction.REGISTERED,
            note: "Free trial started at self-registration",
          },
        });
      }

      const owner = await tx.user.create({
        data: {
          name: ownerName,
          email,
          phone,
          role: UserRole.ADMIN,
          status: UserStatus.INVITED,
          isActive: true,
          storeId: createdStore.id,
        },
      });

      // Written alongside User.storeId, not instead of it: store scoping and
      // permission checks read the membership now.
      await tx.userStoreMembership.create({
        data: {
          userId: owner.id,
          storeId: createdStore.id,
          role: UserRole.ADMIN,
          isActive: true,
          permissions: [],
        },
      });

      // The shop's own counter, so location-scoped screens have somewhere to
      // put things on day one.
      await tx.storeLocation.create({
        data: {
          storeId: createdStore.id,
          name: "Main Counter",
          city: city || null,
        },
      });

      await tx.storeMetal.createMany({
        data: STARTER_METALS.map((metal) => ({
          storeId: createdStore.id,
          name: metal.name,
          hasPurity: metal.hasPurity,
        })),
      });

      for (const category of STARTER_CATEGORIES) {
        const createdCategory = await tx.storeCategory.create({
          data: { storeId: createdStore.id, name: category.name },
        });

        await tx.storeCategoryType.createMany({
          data: category.types.map((type) => ({
            storeId: createdStore.id,
            categoryId: createdCategory.id,
            name: type,
          })),
        });
      }

      return createdStore;
    });

    // Email is best-effort on purpose: the store exists and the owner can
    // already sign in, so a mail failure must not fail the registration or
    // strand a half-created shop.
    const trialLabel = plan
      ? `${plan.name} (${plan.durationDays} days)`
      : "no plan assigned";

    const welcome = storeWelcomeEmail({
      ownerName,
      storeName,
      storeCode: code,
      appName: APP_NAME,
      planLabel: trialLabel,
      email,
      phone,
    });

    await sendMail({
      to: email,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
    });

    await notifySuperAdmins({
      storeName,
      storeCode: code,
      ownerName,
      email,
      phone,
      city: city || null,
      planLabel: trialLabel,
    });

    return {
      success: true,
      message: `${store.name} is ready. Sign in to start exploring.`,
      signInWith: { email, phone },
    };
  } catch (error) {
    console.error("registerStoreAction error:", error);
    return {
      success: false,
      message: "Could not complete registration. Please try again.",
    };
  }
}

/**
 * Tell whoever runs the platform that a shop signed itself up.
 *
 * Recipients come from SUPER_ADMIN_EMAILS — the same env var that decides who
 * is a Super Admin at sign-in — rather than from a role lookup, so the
 * notification still goes out before any Super Admin row exists.
 */
async function notifySuperAdmins(details: {
  storeName: string;
  storeCode: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string | null;
  planLabel: string;
}) {
  const recipients = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.warn(
      "New store registered but SUPER_ADMIN_EMAILS is empty — no notification sent.",
    );
    return;
  }

  const mail = newStoreRegisteredEmail({ ...details, appName: APP_NAME });

  await Promise.all(
    recipients.map((to) =>
      sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text }),
    ),
  );
}
