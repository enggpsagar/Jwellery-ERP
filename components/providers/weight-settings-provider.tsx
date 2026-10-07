"use client"

import { createContext, useContext } from "react"

import { DEFAULT_WEIGHT_SETTINGS, type WeightSettings } from "@/lib/weight-calc"

const WeightSettingsContext = createContext<WeightSettings>(DEFAULT_WEIGHT_SETTINGS)

/**
 * The active store's Settings > Weights, provided once by the dashboard
 * layout so every form's live net / fine preview and every printed weight
 * use the same rules as the server (lib/weight-calc.ts).
 */
export function WeightSettingsProvider({ value, children }: { value: WeightSettings; children: React.ReactNode }) {
  return <WeightSettingsContext.Provider value={value}>{children}</WeightSettingsContext.Provider>
}

export function useWeightSettings(): WeightSettings {
  return useContext(WeightSettingsContext)
}
