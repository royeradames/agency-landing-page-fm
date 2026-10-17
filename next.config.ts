import type { NextConfig } from "next";

// Inline the small stylesheet so the first paint does not wait on a CSS request.
const config: NextConfig = { experimental: { inlineCss: true } };

export default config;
