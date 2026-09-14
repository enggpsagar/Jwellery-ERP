"use client";

import { useEffect } from "react";

/**
 * A focused <input type="number"> silently changes value on mouse-wheel
 * scroll — standard browser behavior (Chrome/Firefox/Edge all do this),
 * not a bug in any one field. On money/weight inputs (Price, Weight,
 * Making Charge, ...) this means an accidental scroll while the cursor
 * happens to be over the field corrupts the value with no visible warning.
 *
 * Fixed once, app-wide, rather than per-input: blurring the input on wheel
 * removes focus before the browser's own scroll-adjusts-value handling can
 * apply, without calling preventDefault — so the page still scrolls
 * normally, only the number field's value stops moving. Mounted once in the
 * root layout (app/layout.tsx) so it covers every number input in the app,
 * present and future, without hunting down all ~34 files that render one.
 */
export function NumberInputWheelGuard() {
  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "number") {
        target.blur();
      }
    }

    document.addEventListener("wheel", handleWheel, { passive: true });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  return null;
}
