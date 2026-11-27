module.exports = {
  apps: [
    {
      name: "api",
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 8000,      // Wait 8s for graceful shutdown before force kill
      restart_delay: 4000,     // Wait 4s after crash before restarting (port release time)
      max_restarts: 10,        // After 10 consecutive crashes, stop auto-restart
      min_uptime: 5000,        // App must run 5s to count as "stable"
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 5000
      }
    }
  ]
};

