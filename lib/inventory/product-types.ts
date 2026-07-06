// lib/inventory/product-types.ts

export type ProductFormState = {
  success: boolean
  message: string
  errors: {
    productCode?: string[]
    name?: string[]
    category?: string[]
    ornamentType?: string[]
    metalType?: string[]
    defaultPurity?: string[]
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