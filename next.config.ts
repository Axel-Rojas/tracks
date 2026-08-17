import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Instant Navigations (Next 16.3): el shell de cada ruta se prefetchea una
  // sola vez y los datos entran por streaming detrás de su <Suspense>.
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
