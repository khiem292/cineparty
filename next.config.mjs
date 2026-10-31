const isGithubPages = process.env.GITHUB_PAGES === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: "export",
  basePath: isGithubPages ? "/cineparty" : "",
  assetPrefix: isGithubPages ? "/cineparty/" : "",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
