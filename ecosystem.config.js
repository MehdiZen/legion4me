module.exports = {
  apps: [
    {
      name: 'legion4me',
      script: 'backend/dist/index.js',
      cwd: __dirname,
      env_file: 'backend/.env',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
}
