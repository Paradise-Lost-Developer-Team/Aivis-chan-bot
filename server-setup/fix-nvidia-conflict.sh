#!/bin/bash
# NVIDIAコンテナランタイムのファイル競合解決スクリプト
# 作成日: 2025/07/21

set -euo pipefail

# ログ設定
LOG_FILE="/var/log/nvidia-conflict-fix.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2>&1

echo "=== NVIDIA Container Runtime ファイル競合解決 ==="
echo "開始日時: $(date)"
echo "ユーザー: $(whoami)"
echo ""

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 現在のNVIDIAパッケージ状況を確認
check_nvidia_packages() {
    print_status "現在インストールされているNVIDIAコンテナ関連パッケージを確認中..."
    
    echo "=== 現在のNVIDIAパッケージ ==="
    zypper search --installed-only nvidia-container* || true
    echo ""
    
    echo "=== パッケージの詳細情報 ==="
    rpm -qa | grep nvidia-container || true
    echo ""
    
    echo "=== 競合ファイルの所有者確認 ==="
    if [ -f "/usr/bin/nvidia-container-runtime" ]; then
        ls -la /usr/bin/nvidia-container-runtime
        rpm -qf /usr/bin/nvidia-container-runtime 2>/dev/null || echo "ファイルはパッケージ管理外"
    else
        echo "/usr/bin/nvidia-container-runtime は存在しません"
    fi
    echo ""
}

# 解決方法1: 古いパッケージを削除してから新しいパッケージをインストール
fix_method_1() {
    print_status "解決方法1: 段階的パッケージ更新を実行中..."
    
    print_warning "nvidia-container-runtime パッケージを削除中..."
    zypper remove -y nvidia-container-runtime || {
        print_error "パッケージ削除に失敗しました"
        return 1
    }
    
    print_status "nvidia-container-toolkit パッケージをインストール中..."
    zypper install -y --auto-agree-with-licenses nvidia-container-toolkit || {
        print_error "nvidia-container-toolkit のインストールに失敗しました"
        return 1
    }
    
    print_success "解決方法1が完了しました"
}

# 解決方法2: 強制的にファイル競合を解決
fix_method_2() {
    print_status "解決方法2: 強制的なファイル競合解決を実行中..."
    
    print_warning "競合ファイルを手動でバックアップ中..."
    if [ -f "/usr/bin/nvidia-container-runtime" ]; then
        cp /usr/bin/nvidia-container-runtime /usr/bin/nvidia-container-runtime.backup.$(date +%Y%m%d_%H%M%S)
        print_status "バックアップを作成しました: /usr/bin/nvidia-container-runtime.backup.*"
    fi
    
    print_status "強制的にパッケージを更新中..."
    zypper update -y --auto-agree-with-licenses --force-resolution || {
        print_error "強制更新に失敗しました"
        return 1
    }
    
    print_success "解決方法2が完了しました"
}

# 解決方法3: 個別パッケージ管理
fix_method_3() {
    print_status "解決方法3: 個別パッケージ管理を実行中..."
    
    print_status "利用可能なNVIDIAコンテナパッケージを確認中..."
    zypper search nvidia-container
    echo ""
    
    print_warning "競合するパッケージを明示的に置換中..."
    zypper install -y --auto-agree-with-licenses --force nvidia-container-toolkit || {
        print_error "強制インストールに失敗しました"
        return 1
    }
    
    print_success "解決方法3が完了しました"
}

# パッケージ整合性確認
verify_installation() {
    print_status "インストール後の確認を実行中..."
    
    echo "=== 最終的なNVIDIAパッケージ状況 ==="
    zypper search --installed-only nvidia-container* || true
    echo ""
    
    echo "=== ファイル確認 ==="
    if [ -f "/usr/bin/nvidia-container-runtime" ]; then
        ls -la /usr/bin/nvidia-container-runtime
        rpm -qf /usr/bin/nvidia-container-runtime
        print_success "nvidia-container-runtime ファイルが正常に配置されています"
    else
        print_warning "nvidia-container-runtime ファイルが見つかりません"
    fi
    
    echo "=== Docker/Podman設定確認 ==="
    if command -v docker &> /dev/null; then
        docker --version
        print_status "Dockerが利用可能です"
    fi
    
    if command -v podman &> /dev/null; then
        podman --version
        print_status "Podmanが利用可能です"
    fi
}

# メイン実行関数
main() {
    print_status "NVIDIA Container Runtime ファイル競合解決を開始します..."
    
    # rootユーザー確認
    if [[ $EUID -ne 0 ]]; then
        print_error "このスクリプトはroot権限で実行する必要があります"
        echo "実行方法: sudo $0"
        exit 1
    fi
    
    # 現在の状況確認
    check_nvidia_packages
    
    # ユーザーに解決方法を選択させる
    echo ""
    print_status "解決方法を選択してください:"
    echo "1) 段階的パッケージ更新 (推奨)"
    echo "2) 強制的なファイル競合解決"
    echo "3) 個別パッケージ管理"
    echo "4) 手動で解決する"
    echo ""
    
    read -p "選択してください (1-4): " choice
    
    case $choice in
        1)
            fix_method_1 && verify_installation
            ;;
        2)
            fix_method_2 && verify_installation
            ;;
        3)
            fix_method_3 && verify_installation
            ;;
        4)
            print_status "手動解決のための情報を表示します:"
            echo ""
            echo "手動解決コマンド例:"
            echo "1. 古いパッケージを削除:"
            echo "   sudo zypper remove nvidia-container-runtime"
            echo ""
            echo "2. 新しいパッケージをインストール:"
            echo "   sudo zypper install --auto-agree-with-licenses nvidia-container-toolkit"
            echo ""
            echo "3. または強制的に更新:"
            echo "   sudo zypper update --auto-agree-with-licenses --force-resolution"
            ;;
        *)
            print_error "無効な選択です"
            exit 1
            ;;
    esac
    
    print_success "NVIDIA Container Runtime ファイル競合解決が完了しました"
    echo "ログファイル: $LOG_FILE"
}

# スクリプト実行
main "$@"
