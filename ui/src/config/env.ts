const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api",
);

export const SSE_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_SSE_BASE_URL ?? "http://localhost:8080/sse",
);

