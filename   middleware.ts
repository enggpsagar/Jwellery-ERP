// File: src/middleware.ts

export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/products/:path*",
    "/inventory/:path*",
    "/suppliers/:path*",
    "/karigars/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};