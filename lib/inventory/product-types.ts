// lib/inventory/product-types.ts

export type ProductFormState = {
  success: boolean
  message: string
  errors: {
    productCode?: string[]
    name?: string[]
    categoryId?: string[]
    categoryTypeId?: string[]
    metalTypeId?: string[]
    defaultPurity?: string[]
    defaultMakingCharge?: string[]
    defaultStoneCharge?: string[]
    defaultGrossWeight?: string[]
    defaultNetWeight?: string[]
    defaultStoneWeight?: string[]
    defaultCaratWeight?: string[]
    defaultStoneRate?: string[]
    designCode?: string[]
    hsnCode?: string[]
    description?: string[]
    notes?: string[]
    isActive?: string[]
    stockQuantity?: string[]
  }
  /** Set on a successful createProduct — lets a caller that navigated here
   * to create a product mid-flow (e.g. a purchase in progress) come back
   * and select the new row. Mirrors CustomerFormState.customer. */
  product?: {
    id: string
    name: string
    productCode: string
  }
}

export const initialProductFormState: ProductFormState = {
  success: false,
  message: "",
  errors: {},
}