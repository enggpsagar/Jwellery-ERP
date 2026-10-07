import { redirect } from "next/navigation";

// The old Purity & Carat page edited a fixed, schema-enum list (Gold
// 24K/22K/20K/18K, Silver 999/925, Platinum 950/900, Diamond, Other) and
// couldn't take a store's own purities such as 14K or 9K. Purities, their
// fineness and stone types' grams-per-carat now live in Settings > Metals &
// Categories, and weight calculation in Settings > Weights. The old
// PurityFineness / CaratConversionRate rows stay in the database only as the
// fallback for very old records with no store purity attached
// (lib/purity-db.ts). Old links land on the page that replaced it.
export default function PuritySettingsRedirect() {
  redirect("/settings/taxonomy");
}
