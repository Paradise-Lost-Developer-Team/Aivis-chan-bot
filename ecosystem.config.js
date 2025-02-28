module.exports = {
  apps: [{
    name: "aivis-chan-bot",
    script: "./build/js/index.js", // 正しいビルド出力先のパス
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production"
    },
    // 再起動ポリシー：クラッシュ後の再起動を管理
    restart_delay: 3000, // 3秒待ってから再起動
    exp_backoff_restart_delay: 100, // 再起動間隔を指数関数的に増加
    max_restarts: 10, // 10回以上クラッシュしたら再起動を止める
    time: true, // ログに時間を付ける
    // クラッシュ検知
    wait_ready: true, // プロセスがready信号を送るまで待つ
    listen_timeout: 50000, // ready待ち時間
    kill_timeout: 5000, // SIGKILLを送るまでの時間
  }]
};
