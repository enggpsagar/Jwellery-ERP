"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"

import type { StoreMetalRow, StoreMetalOriginRow } from "@/lib/actions/taxonomy-actions"
import { AddStoneDialog } from "@/components/inventory/shared/add-stone-dialog"
import { AddStoneTypeDialog } from "@/components/inventory/shared/add-stone-type-dialog"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type StoneComponentFieldsProps = {
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  onMetalsChange: (next: StoreMetalRow[]) => void
  onOriginsChange: (next: StoreMetalOriginRow[]) => void
  /** Name of the selected Stone (e.g. "Diamond") — plain text, not an id;
   * see the schema's own note on stoneMetalTypeName for why. */
  stoneMetalTypeName: string
  onStoneChange: (name: string, typeNames: string[]) => void
  selectedTypeNames: string[]
  onTypesChange: (names: string[]) => void
  /** Carat Weight and Stone Rate render as part of this component's own
   * grid (not a separate block the caller stacks below it) so the whole
   * "Stone" section shares one consistent set of column widths instead of
   * a full-width picker sitting above two independently-sized inputs. */
  caratWeight: number
  onCaratWeightChange: (value: string) => void
  stoneRate: number
  onStoneRateChange: (value: string) => void
  /** Stone Charge — Stone Rate x Stone Carat Weight, auto-calculated by the
   * caller until edited directly (stoneChargeTouched flips the hint below
   * from "auto-calculated" to "manually entered", same escape-hatch pattern
   * as every other auto-filled field in these forms). Rendered in this same
   * grid, right after the Carat Weight/Rate it's computed from, so a store
   * owner can see the relationship instead of finding Stone Charge as a
   * disconnected field elsewhere on the line. */
  stoneCharge: number
  onStoneChargeChange: (value: string) => void
  stoneChargeTouched: boolean
  /** Net Stone Weight — this stone's own physical weight, subtracted out of
   * Gross Weight elsewhere on the line to get the metal's own Net Weight.
   * Mirrors Stone Carat Weight (same physical stone, common case) until
   * edited directly — see netStoneWeightTouched. Grouped here last since,
   * of every stone-pricing field, this is the one that reaches out and
   * affects the metal's own weight math. */
  stoneWeightInput: number
  onStoneWeightInputChange: (value: string) => void
  stoneWeightUnit: "GRAM" | "CARAT"
  onStoneWeightUnitChange: (unit: "GRAM" | "CARAT") => void
  netStoneWeightTouched: boolean
}

/**
 * The "which Stone, and which of its Stone Types" picker shown once a line
 * item's "Includes a Stone" checkbox is on. Two levels, both drawn from the
 * Settings → Taxonomy tables (StoreMetal rows with isGemstone=true are
 * Stones; StoreMetalOrigin rows under one are its Stone Types), each with
 * its own search box and an inline "Add" that doesn't navigate away from
 * the in-progress document — see AddStoneDialog's own comment for why.
 *
 * Picking a Stone defaults every one of its Stone Types to checked — most
 * pieces are simply "Diamond", but a piece can genuinely mix e.g. natural
 * and lab-grown melee, so starting from "all of them" and letting the user
 * uncheck what doesn't apply is the fewer-clicks default for the common
 * single-type case while still allowing the mixed one.
 */
export function StoneComponentFields({
  metals,
  origins,
  onMetalsChange,
  onOriginsChange,
  stoneMetalTypeName,
  onStoneChange,
  selectedTypeNames,
  onTypesChange,
  caratWeight,
  onCaratWeightChange,
  stoneRate,
  onStoneRateChange,
  stoneCharge,
  onStoneChargeChange,
  stoneChargeTouched,
  stoneWeightInput,
  onStoneWeightInputChange,
  stoneWeightUnit,
  onStoneWeightUnitChange,
  netStoneWeightTouched,
}: StoneComponentFieldsProps) {
  const [stoneSearch, setStoneSearch] = useState("")
  const [typeSearch, setTypeSearch] = useState("")
  const [addStoneOpen, setAddStoneOpen] = useState(false)
  const [addTypeOpen, setAddTypeOpen] = useState(false)

  const stones = useMemo(
    () => metals.filter((metal) => metal.isGemstone && metal.isActive),
    [metals],
  )

  const filteredStones = useMemo(() => {
    const query = stoneSearch.trim().toLowerCase()
    if (!query) return stones
    return stones.filter((stone) => stone.name.toLowerCase().includes(query))
  }, [stones, stoneSearch])

  const selectedStone = stones.find((stone) => stone.name === stoneMetalTypeName)

  const typesForStone = useMemo(
    () =>
      selectedStone
        ? origins.filter((origin) => origin.storeMetalId === selectedStone.id && origin.isActive)
        : [],
    [origins, selectedStone],
  )

  const filteredTypes = useMemo(() => {
    const query = typeSearch.trim().toLowerCase()
    if (!query) return typesForStone
    return typesForStone.filter((type) => type.name.toLowerCase().includes(query))
  }, [typesForStone, typeSearch])

  function handleStoneSelect(name: string) {
    const stone = stones.find((s) => s.name === name)
    const defaultTypes = stone
      ? origins.filter((o) => o.storeMetalId === stone.id && o.isActive).map((o) => o.name)
      : []
    onStoneChange(name, defaultTypes)
  }

  function toggleType(name: string, checked: boolean) {
    onTypesChange(
      checked ? [...selectedTypeNames, name] : selectedTypeNames.filter((n) => n !== name),
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Stone</Label>
          <div className="flex gap-1.5">
            <Select value={stoneMetalTypeName} onValueChange={handleStoneSelect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a stone" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    placeholder="Search stones..."
                    value={stoneSearch}
                    onChange={(event) => setStoneSearch(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                </div>

                {filteredStones.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No stones found{stoneSearch ? ` for "${stoneSearch}"` : ""}
                  </div>
                ) : (
                  filteredStones.map((stone) => (
                    <SelectItem key={stone.id} value={stone.name}>
                      {stone.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Add Stone"
              onClick={() => setAddStoneOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Stone Carat Weight (ct)</Label>
          <Input
            type="number"
            step="0.001"
            value={caratWeight === 0 ? "" : caratWeight}
            onChange={(event) => onCaratWeightChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Stone's own weight — independent of Net Weight
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Stone Rate (₹/ct)</Label>
          <Input
            type="number"
            step="0.01"
            value={stoneRate === 0 ? "" : stoneRate}
            onChange={(event) => onStoneRateChange(event.target.value)}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Stone Charge</Label>
          <Input
            type="number"
            step="0.01"
            value={stoneCharge === 0 ? "" : stoneCharge}
            onChange={(event) => onStoneChargeChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {stoneChargeTouched
              ? "Manually entered — won't update from Carat × Rate anymore"
              : "Auto-calculated from Carat × Rate — edit to override"}
          </p>
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Net Stone Weight</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              step="0.00001"
              className="flex-1"
              value={stoneWeightInput === 0 ? "" : stoneWeightInput}
              onChange={(event) => onStoneWeightInputChange(event.target.value)}
            />
            <Select value={stoneWeightUnit} onValueChange={(unit) => onStoneWeightUnitChange(unit as "GRAM" | "CARAT")}>
              <SelectTrigger className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GRAM">g</SelectItem>
                <SelectItem value="CARAT">ct</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {netStoneWeightTouched
              ? "Manually entered"
              : "Auto-filled from Stone Carat Weight — edit to override"}
          </p>
        </div>
      </div>

      {selectedStone && (
        <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Stone Types</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs"
              onClick={() => setAddTypeOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Add Stone Type
            </Button>
          </div>

          {typesForStone.length > 3 && (
            <Input
              placeholder="Search stone types..."
              value={typeSearch}
              onChange={(event) => setTypeSearch(event.target.value)}
              className="h-8"
            />
          )}

          {typesForStone.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No Stone Types configured for {selectedStone.name} yet — add one above.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {filteredTypes.map((type) => (
                <label key={type.id} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedTypeNames.includes(type.name)}
                    onChange={(event) => toggleType(type.name, event.target.checked)}
                  />
                  {type.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <AddStoneDialog
        open={addStoneOpen}
        onOpenChange={setAddStoneOpen}
        onCreated={(stone) => {
          onMetalsChange([...metals, stone])
          handleStoneSelect(stone.name)
        }}
      />

      {selectedStone && (
        <AddStoneTypeDialog
          open={addTypeOpen}
          onOpenChange={setAddTypeOpen}
          storeMetalId={selectedStone.id}
          storeMetalName={selectedStone.name}
          onCreated={(origin) => {
            onOriginsChange([...origins, origin])
            onTypesChange([...selectedTypeNames, origin.name])
          }}
        />
      )}
    </div>
  )
}
