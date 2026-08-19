import { getStores } from "@/lib/actions/store-actions";
import { StoreTable } from "@/components/stores/store-table";
import { StoreFormDialog } from "@/components/stores/store-form-dialog";

export default async function StoresPage() {
  const stores = await getStores();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stores</h1>
          <p className="text-muted-foreground">
            Create stores and their admins. Use the store switcher in the
            top bar to manage a store&apos;s data.
          </p>
        </div>

        <StoreFormDialog />
      </div>

      <StoreTable stores={stores} />
    </div>
  );
}
