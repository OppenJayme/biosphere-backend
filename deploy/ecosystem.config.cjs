'use strict';
// pm2 process file for the DCISM server. See docs/DEPLOYMENT_GUIDE.md.
//
//   pm2 start deploy/ecosystem.config.cjs     (from the backend checkout)
//   pm2 save
//
// Ports are fixed by the DCISM web admin panel: Apache proxies
// biosphere.dcism.org to 127.0.0.1:20311 and biosphere-api.dcism.org to
// 127.0.0.1:20312. Secrets stay in each checkout's .env / .env.local, never here.
const path = require('node:path');

const backendDir = path.resolve(__dirname, '..');
const frontendDir =
  process.env.BIOSPHERE_FRONTEND_DIR ||
  path.resolve(backendDir, '..', 'biosphere-frontend');

module.exports = {
  apps: [
    {
      name: 'biosphere-api',
      cwd: backendDir,
      script: 'dist/main.js',
      env: { NODE_ENV: 'production', PORT: '20312', HOST: '127.0.0.1' },
      max_memory_restart: '700M',
      restart_delay: 5000,
      time: true,
    },
    {
      name: 'biosphere-web',
      cwd: frontendDir,
      script: 'node_modules/next/dist/bin/next',
      // Bind to loopback: only Apache should reach the app directly.
      args: 'start -p 20311 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
      restart_delay: 5000,
      time: true,
    },
  ],
};
