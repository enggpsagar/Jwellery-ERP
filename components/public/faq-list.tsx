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
            <p className="whitespace-pre-line">{faq.answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
