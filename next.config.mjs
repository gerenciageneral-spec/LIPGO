/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Los Server Actions traen 1MB por defecto; los soportes SST (0312, 60
    // estándares, etc.) suben documentos (PDF/Word/imágenes) que fácilmente lo
    // superan y la subida se quedaba "cargando" sin subir. Se sube a 50MB.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
}

export default nextConfig
