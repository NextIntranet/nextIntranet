import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Safely evaluate a basic arithmetic expression (digits, +−×÷, parens).
 *  Returns null if the input is empty, contains unsafe characters, or throws. */
export function evalMathExpr(expr: string): number | null {
  const s = expr.trim()
  if (s === "") return null
  if (!/^[\d+\-*/.()\s]+$/.test(s)) return null
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${s})`)()
    if (typeof result !== "number" || !isFinite(result)) return null
    return result
  } catch {
    return null
  }
}
