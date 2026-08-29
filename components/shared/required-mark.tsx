/**
 * The asterisk on a required field's label.
 *
 * Red, because that is the only thing making it read as a requirement rather
 * than a footnote marker — an asterisk in body colour is easy to skim past on
 * a long form.
 *
 * Hidden from screen readers: the input itself carries `required`, which is
 * already announced, and reading "star" alongside it says nothing useful.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}
