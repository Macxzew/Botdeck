// Config Next courte

import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
	allowedDevOrigins: ["127.0.0.1"],
	devIndicators: false,
	typescript: {
		ignoreBuildErrors: true
	},
	typedRoutes: true,
	turbopack: {
		root: path.resolve(/* turbopackIgnore: true */ appDir, "../..")
	},
	serverExternalPackages: ["discord.js", "ws"]
};

export default nextConfig;
