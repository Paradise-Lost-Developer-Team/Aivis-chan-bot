module.exports = {
    apps: [
      {
          name: 'aivis-chan-bot',
          script: 'build/js/index.js',
          watch: true,
          autorestart: true,
          max_memory_restart: '1G',
          env: {
              NODE_ENV: 'development',
          },
      },
    ],
  };