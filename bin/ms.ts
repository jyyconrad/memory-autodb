#!/usr/bin/env tsx
import { runMengshuCli } from "../packages/api/src/cli/ms.js";

runMengshuCli().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
