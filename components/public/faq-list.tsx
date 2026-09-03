import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { PlatformFaqRow } from "@/lib/actions/platform-content-actions"

type FaqListProps = {
  faqs: PlatformFaqRow[]
}

/**
 * Accordion-style FAQ list. Shared by the public /faq page and the
 * authenticated app's /help page — both call getPlatformFaqs({
 * publishedOnly: true }) and pass the result straight in, so a draft FAQ
 * never appears here.
 */
export function FaqList({ faqs }: FaqListProps) {
  if (faqs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No questions have been published yet.
      </p>
    )
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {faqs.map((faq) => (
        <AccordionItem key={faq.id} value={faq.id}>
          <AccordionTrigger>{faq.question}</AccordionTrigger>
          <AccordionContent>
            {/* faq.answer is TipTap-authored HTML from a SUPER_ADMIN-only
                editor — never user-generated, so rendered directly. */}
            <div
              className="prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
              dangerouslySetInnerHTML={{ __html: faq.answer }}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
