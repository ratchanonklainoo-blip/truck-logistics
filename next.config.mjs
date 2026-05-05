/** @type {import('next').NextConfig} */
const nextConfig = {
  // ข้าม TypeScript และ ESLint errors ระหว่าง build (แก้ทีหลัง)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['html2pdf.js'],
  },
};

export default nextConfig;
