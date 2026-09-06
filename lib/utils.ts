import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Capitalizes the first letter of each word — display-only formatting for
 * names that may have been typed in any case (e.g. "rohit sharma"), never
 * changes what's actually stored. */
export function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ")
}
