import type { NextConfig } from "next";

// The PDF export pipeline uses pdfkit, which loads its standard fonts via
// dynamic `require()` calls that Next.js/Webpack can't statically follow.
// We ship the full pdfkit package (plus its data/font assets) alongside the
// serverless bundle so those runtime requires resolve on Vercel.
const dossierExportAssets = [
  "./public/logos/**",
  "./node_modules/pdfkit/**",
  "./node_modules/fontkit/**",
  "./node_modules/@react-pdf/**",
  "./node_modules/restructure/**",
  "./node_modules/linebreak/**",
  "./node_modules/unicode-properties/**",
  "./node_modules/unicode-trie/**",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/api/students/export": dossierExportAssets,
    "/api/classes/export-dossiers": dossierExportAssets,
  },
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/font",
    "@react-pdf/layout",
    "@react-pdf/pdfkit",
    "@react-pdf/render",
    "@react-pdf/textkit",
    "@react-pdf/primitives",
    "@react-pdf/fns",
    "pdfkit",
    "fontkit",
    "restructure",
    "linebreak",
    "unicode-properties",
    "unicode-trie",
    "jszip",
  ],
  async redirects() {
    return [
      {
        source: "/admin/grades/overview",
        destination: "/admin/grades-matrix",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
