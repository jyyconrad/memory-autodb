#!/usr/bin/env node

import { spawn } from "node:child_process";

const child = spawn("ms", ["mcp"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MENGSHU_HOME: process.env.MENGSHU_HOME || `${process.env.HOME}/.mengshu`,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Failed to start mengshu MCP server via 'ms mcp': ${error.message}`);
  process.exit(1);
});
