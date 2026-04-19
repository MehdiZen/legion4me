module.exports = {
  apps: [
    {
      name: 'asmodeus',
      script: 'backend/dist/index.js',
      cwd: __dirname,
      env_file: 'backend/.env',
      env: {
        DB_PATH: './backend/asmodeus.db',
      },
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
}
