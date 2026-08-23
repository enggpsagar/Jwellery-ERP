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
    designCode?: string[]
    hsnCode?: string[]
    description?: string[]
    notes?: string[]
    isActive?: string[]
  }
}

export const initialProductFormState: ProductFormState = {
  success: false,
  message: "",
  errors: {},
}