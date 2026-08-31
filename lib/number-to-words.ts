const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function threeDigitsToWords(value: number): string {
  const parts: string[] = [];

  if (value >= 100) {
    parts.push(`${ONES[Math.floor(value / 100)]} Hundred`);
    value %= 100;
  }

  if (value >= 20) {
    parts.push(TENS[Math.floor(value / 10)]);
    value %= 10;
  }

  if (value > 0) {
    parts.push(ONES[value]);
  }

  return parts.join(" ");
}

/**
 * Indian numbering (lakh/crore) integer-to-words, e.g. 208650 -> "Two Lakh
 * Eight Thousand Six Hundred Fifty".
 */
function integerToWords(value: number): string {
  if (value === 0) return "Zero";

  const crore = Math.floor(value / 10000000);
  value %= 10000000;
  const lakh = Math.floor(value / 100000);
  value %= 100000;
  const thousand = Math.floor(value / 1000);
  value %= 1000;
  const hundred = value;

  const segments: string[] = [];
  if (crore) segments.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) segments.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) segments.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) segments.push(threeDigitsToWords(hundred));

  return segments.join(" ");
}

/**
 * A rupee amount as words for the printed invoice's "Value in words" line,
 * e.g. 208650 -> "Rupees Two Lakh Eight Thousand Six Hundred Fifty Only".
 * Paise are included only when present, matching how such lines read in
 * practice — a whole-rupee invoice doesn't say "and Zero Paise".
 */
export function amountInWords(amount: number): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const rupeeWords = integerToWords(rupees);
  const paiseWords = paise > 0 ? ` and ${integerToWords(paise)} Paise` : "";

  return `Rupees ${rupeeWords}${paiseWords} Only`;
}
