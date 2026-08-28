import { getPlans } from "@/lib/actions/plan-actions";
import { PlansClient } from "@/components/plans/plans-client";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await getPlans();

  return <PlansClient plans={plans} />;
}
