#!/bin/bash
# NVIDIA Container Runtime ファイル競合 - クイックフィックス
# 作成日: 2025/07/21

set -euo pipefail

echo "=== NVIDIA Container Runtime ファイル競合 - クイックフィックス ==="
echo "問題: nvidia-container-toolkit と nvidia-container-runtime のファイル競合"
echo ""

# rootユーザー確認
if [[ $EUID -ne 0 ]]; then
    echo "エラー: このスクリプトはroot権限で実行する必要があります"
    echo "実行方法: sudo $0"
    exit 1
fi

echo "現在の状況を確認中..."
echo "=== 競合パッケージの確認 ==="
rpm -qa | grep nvidia-container
echo ""

echo "=== 解決策を実行中 ==="

# 方法1: 古いパッケージを削除してから新しいパッケージをインストール
echo "ステップ1: nvidia-container-runtime パッケージを削除中..."
zypper remove -y nvidia-container-runtime

echo "ステップ2: システムをクリーンアップ中..."
zypper clean --all

echo "ステップ3: nvidia-container-toolkit をインストール中..."
zypper install -y --auto-agree-with-licenses nvidia-container-toolkit

echo "ステップ4: インストール確認中..."
rpm -qa | grep nvidia-container
echo ""

if [ -f "/usr/bin/nvidia-container-runtime" ]; then
    echo "✓ nvidia-container-runtime ファイルが正常にインストールされました"
    ls -la /usr/bin/nvidia-container-runtime
    rpm -qf /usr/bin/nvidia-container-runtime
else
    echo "⚠ nvidia-container-runtime ファイルが見つかりません"
fi

echo ""
echo "=== 解決完了 ==="
echo "NVIDIA Container Runtime のファイル競合が解決されました。"
echo "続いて通常のシステム更新を実行できます:"
echo "  sudo zypper update --auto-agree-with-licenses"
