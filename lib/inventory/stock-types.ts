export type StockFormState = {
  success: boolean
  message: string
  errors: Record<string, string[]>
}

export const initialStockFormState: StockFormState = {
  success: false,
  message: "",
  errors: {},
}