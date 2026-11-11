// public-url.ts — base URL pubblica della piattaforma.
//
// Serve per costruire link canonici, sitemap e URL dei siti pubblicati. La
// base arriva dall'ambiente (deploy reale); in assenza si usa il dominio
// pubblico noto, cosi' i link non diventano mai "localhost".

export function publicBaseUrl(): string {
  const configured =
    process.env.PUBLIC_BASE_URL ??
    (process.env.PLATFORM_DOMAIN ? `https://${process.env.PLATFORM_DOMAIN}` : "");
  if (configured) return configured.replace(/\/$/, "");
  return "https://platform.aethersy.online";
}
