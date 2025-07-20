#!/bin/bash
# Docker NVIDIA Container Runtime クイックフィックス
# 作成日: 2025/07/21

echo "=== Docker NVIDIA Container Runtime クイックフィックス ==="
echo "エラー: /usr/bin/nvidia-container-runtime did not terminate successfully"
echo ""

# rootユーザー確認
if [[ $EUID -ne 0 ]]; then
    echo "エラー: このスクリプトはroot権限で実行する必要があります"
    echo "実行方法: sudo $0"
    exit 1
fi

echo "ステップ1: nvidia-container-runtime ファイルの確認..."
if [ -f "/usr/bin/nvidia-container-runtime" ]; then
    echo "✓ ファイルが存在します"
    ls -la /usr/bin/nvidia-container-runtime
    
    # 実行権限の確認と修正
    chmod +x /usr/bin/nvidia-container-runtime
    echo "✓ 実行権限を設定しました"
else
    echo "✗ nvidia-container-runtime が見つかりません"
    echo "NVIDIA Container Toolkit を再インストールします..."
    
    zypper remove -y nvidia-container-runtime nvidia-container-toolkit || true
    zypper install -y --auto-agree-with-licenses nvidia-container-toolkit
    
    if [ -f "/usr/bin/nvidia-container-runtime" ]; then
        chmod +x /usr/bin/nvidia-container-runtime
        echo "✓ nvidia-container-runtime がインストールされました"
    else
        echo "✗ インストールに失敗しました"
        exit 1
    fi
fi

echo ""
echo "ステップ2: Docker設定の修正..."

# daemon.json のバックアップ
if [ -f "/etc/docker/daemon.json" ]; then
    cp /etc/docker/daemon.json /etc/docker/daemon.json.backup
    echo "✓ daemon.json をバックアップしました"
fi

# Docker設定ディレクトリの作成
mkdir -p /etc/docker

# シンプルなdaemon.json設定
cat > /etc/docker/daemon.json << 'EOF'
{
    "runtimes": {
        "nvidia": {
            "path": "/usr/bin/nvidia-container-runtime",
            "runtimeArgs": []
        }
    }
}
EOF

echo "✓ daemon.json を更新しました"

echo ""
echo "ステップ3: Dockerサービス再起動..."
systemctl stop docker
sleep 2
systemctl start docker

if systemctl is-active --quiet docker; then
    echo "✓ Dockerサービスが正常に起動しました"
else
    echo "✗ Dockerサービスの起動に失敗しました"
    exit 1
fi

echo ""
echo "ステップ4: 問題のあるコンテナを削除..."
docker stop aivisspeech-engine 2>/dev/null || true
docker rm aivisspeech-engine 2>/dev/null || true
echo "✓ 古いコンテナを削除しました"

echo ""
echo "=== 修復完了 ==="
echo "次のステップ:"
echo "1. aivisspeech-engine コンテナを再作成してください"
echo "2. NVIDIAランタイムが不要な場合は --runtime=nvidia オプションを除外してください"
echo ""
echo "コンテナ再作成例:"
echo "docker run -d --name aivisspeech-engine [その他のオプション] [イメージ名]"
echo ""
echo "またはNVIDIAランタイム使用:"
echo "docker run -d --name aivisspeech-engine --runtime=nvidia [その他のオプション] [イメージ名]"
