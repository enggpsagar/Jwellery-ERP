// Pre-filled for every store — a new store at creation, existing stores
// once via migration 20261007130000_seed_styles_clarities. Only seeded
// when a store has none, so anything a store deletes stays deleted.

export const STARTER_STYLES = ["Ladies", "Gents", "Kids", "Unisex"]

// Common diamond colour/clarity grades as tagged in the trade.
export const STARTER_CLARITIES = [
  "EF/VVS",
  "EF/VVS-VS",
  "FG/VVS-VS",
  "GH/VS",
  "GH/VS-SI",
  "HI/SI",
  "IJ/SI",
]
