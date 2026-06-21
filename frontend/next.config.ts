import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {};

export default withEve(nextConfig, {
  eveRoot: "../eve",
  eveBuildCommand: "npm run build:eve",
});
