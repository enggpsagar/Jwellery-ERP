import { formatShortDate } from "@/lib/utils"
import type { MyJobDetail } from "@/lib/actions/my-jobs-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WeightText } from "@/components/shared/weight-text"

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
          <Field label="Issue Weight" value={job.issueWeight ? <WeightText value={job.issueWeight} /> : "-"} />
          <Field label="Issue Fine Weight" value={job.issueFineWeight ? <WeightText value={job.issueFineWeight} /> : "-"} />
          <Field label="Received Weight" value={job.receiveWeight ? <WeightText value={job.receiveWeight} /> : "-"} />
          <Field
            label="Received Fine Weight"
            value={job.receiveFineWeight ? <WeightText value={job.receiveFineWeight} /> : "-"}
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
                    <span>Weight: {item.estimatedWeight ? <WeightText value={item.estimatedWeight} /> : "-"}</span>
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
                  <span>Gross: {item.grossWeight ? <WeightText value={item.grossWeight} /> : "-"}</span>
                  <span>Net: {item.netWeight ? <WeightText value={item.netWeight} /> : "-"}</span>
                  <span>
                    Fine: <WeightText value={item.fineWeight} />
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {job.ledgerEntries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Ledger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.ledgerEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">{formatShortDate(entry.dateISO)}</span>
                  <div className="text-right font-medium">
                    {entry.metalWeightFine ? (
                      <div>
                        {entry.type === "DEBIT" ? "+" : "-"}
                        <WeightText value={entry.metalWeightFine} />
                        {entry.metalName ? ` ${entry.metalName}` : ""}
                      </div>
                    ) : null}
                    {entry.amount ? (
                      <div>
                        {entry.type === "DEBIT" ? "+" : "-"}₹ {entry.amount.toLocaleString("en-IN")}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1">{entry.description}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
