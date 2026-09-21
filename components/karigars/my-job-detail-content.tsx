import { formatShortDate } from "@/lib/utils"
import type { MyJobDetail } from "@/lib/actions/my-jobs-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value ?? "-"}</div>
    </div>
  )
}

/**
 * Job info + linked Draft Order's requested items + received items — shared
 * between the standalone /my-jobs/[id] page and the inline detail panel on
 * /my-jobs itself, same convention as DraftOrderDetailContent.
 */
export function MyJobDetailContent({ job }: { job: MyJobDetail }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Issued" value={formatShortDate(job.issueDate)} />
          <Field label="Expected" value={job.expectedDate ? formatShortDate(job.expectedDate) : "-"} />
          <Field label="Received" value={job.receivedDate ? formatShortDate(job.receivedDate) : "-"} />
          <Field label="Location" value={job.locationName} />
          <Field label="Metal" value={job.metalName} />
          <Field label="Issue Purity" value={job.issuePurityLabel} />
          <Field label="Issue Weight" value={job.issueWeight ? `${job.issueWeight} g` : "-"} />
          <Field label="Issue Fine Weight" value={job.issueFineWeight ? `${job.issueFineWeight} g` : "-"} />
          <Field label="Received Weight" value={job.receiveWeight ? `${job.receiveWeight} g` : "-"} />
          <Field
            label="Received Fine Weight"
            value={job.receiveFineWeight ? `${job.receiveFineWeight} g` : "-"}
          />
          <Field label="Labour Charge" value={`₹ ${job.labourCharge.toLocaleString("en-IN")}`} />
          <Field label="Finished Piece" value={job.finishedPieceLabel} />
          {job.notes ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes" value={job.notes} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {job.draftOrder ? (
        <Card>
          <CardHeader>
            <CardTitle>What to Make — {job.draftOrder.orderNumber}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.draftOrder.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items on this order.</p>
            ) : (
              job.draftOrder.items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">{item.itemName}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                    <span>Qty: {item.quantity}</span>
                    <span>Weight: {item.estimatedWeight ? `${item.estimatedWeight} g` : "-"}</span>
                    <span>Purity: {item.purityLabel ?? "-"}</span>
                  </div>
                  {item.designNotes ? (
                    <div className="mt-2 text-muted-foreground">{item.designNotes}</div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {job.receiptItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Received Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.receiptItems.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{item.itemName}</div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                  <span>Qty: {item.quantity}</span>
                  <span>Purity: {item.purityLabel ?? "-"}</span>
                  <span>Gross: {item.grossWeight ? `${item.grossWeight} g` : "-"}</span>
                  <span>Net: {item.netWeight ? `${item.netWeight} g` : "-"}</span>
                  <span>Fine: {item.fineWeight} g</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
