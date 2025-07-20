#!/bin/bash
# Docker NVIDIA Container Runtime 修復スクリプト
# 作成日: 2025/07/21

set -euo pipefail

echo "=== Docker NVIDIA Container Runtime 修復 ==="
echo "開始日時: $(date)"
echo ""

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# rootユーザー確認
if [[ $EUID -ne 0 ]]; then
    print_error "このスクリプトはroot権限で実行する必要があります"
    echo "実行方法: sudo $0"
    exit 1
fi

# 1. 現在の状況確認
check_current_status() {
    print_status "現在の状況を確認中..."
    
    echo "=== Dockerサービス状況 ==="
    systemctl status docker --no-pager -l || true
    echo ""
    
    echo "=== Dockerデーモン設定 ==="
    if [ -f "/etc/docker/daemon.json" ]; then
        cat /etc/docker/daemon.json
    else
        echo "daemon.json が存在しません"
    fi
    echo ""
    
    echo "=== NVIDIA Container Runtime ファイル確認 ==="
    if [ -f "/usr/bin/nvidia-container-runtime" ]; then
        ls -la /usr/bin/nvidia-container-runtime
        echo "ファイルが存在します"
        
        # 実行権限確認
        if [ -x "/usr/bin/nvidia-container-runtime" ]; then
            print_success "実行権限があります"
        else
            print_warning "実行権限がありません"
        fi
        
        # 実行テスト
        print_status "nvidia-container-runtime の動作テスト中..."
        /usr/bin/nvidia-container-runtime --version 2>&1 || {
            print_error "nvidia-container-runtime の実行に失敗しました"
        }
    else
        print_error "/usr/bin/nvidia-container-runtime が存在しません"
    fi
    echo ""
    
    echo "=== インストール済みNVIDIAパッケージ ==="
    rpm -qa | grep nvidia-container || echo "NVIDIAコンテナパッケージが見つかりません"
    echo ""
    
    echo "=== 問題のコンテナ確認 ==="
    docker ps -a | grep aivisspeech-engine || echo "aivisspeech-engine コンテナが見つかりません"
    echo ""
}

# 2. NVIDIA Container Toolkit の再インストール
reinstall_nvidia_toolkit() {
    print_status "NVIDIA Container Toolkit を再インストール中..."
    
    # 既存パッケージの削除
    print_warning "既存のNVIDIAコンテナパッケージを削除中..."
    zypper remove -y nvidia-container-runtime nvidia-container-toolkit || true
    
    # システムクリーンアップ
    zypper clean --all
    
    # 新しいパッケージのインストール
    print_status "nvidia-container-toolkit をインストール中..."
    zypper install -y --auto-agree-with-licenses nvidia-container-toolkit
    
    # インストール確認
    if [ -f "/usr/bin/nvidia-container-runtime" ]; then
        print_success "nvidia-container-runtime がインストールされました"
        chmod +x /usr/bin/nvidia-container-runtime
        ls -la /usr/bin/nvidia-container-runtime
    else
        print_error "インストールに失敗しました"
        return 1
    fi
}

# 3. Docker設定の修正
configure_docker() {
    print_status "Docker設定を修正中..."
    
    # daemon.json のバックアップ
    if [ -f "/etc/docker/daemon.json" ]; then
        cp /etc/docker/daemon.json /etc/docker/daemon.json.backup.$(date +%Y%m%d_%H%M%S)
        print_status "daemon.json をバックアップしました"
    fi
    
    # Docker設定ディレクトリの作成
    mkdir -p /etc/docker
    
    # 新しいdaemon.json設定
    cat > /etc/docker/daemon.json << 'EOF'
{
    "runtimes": {
        "nvidia": {
            "path": "/usr/bin/nvidia-container-runtime",
            "runtimeArgs": []
        }
    },
    "default-runtime": "runc"
}
EOF
    
    print_success "daemon.json を更新しました"
    cat /etc/docker/daemon.json
    echo ""
}

# 4. Dockerサービスの再起動
restart_docker() {
    print_status "Dockerサービスを再起動中..."
    
    systemctl stop docker || true
    sleep 2
    systemctl start docker
    systemctl enable docker
    
    # サービス状況確認
    if systemctl is-active --quiet docker; then
        print_success "Dockerサービスが正常に起動しました"
    else
        print_error "Dockerサービスの起動に失敗しました"
        systemctl status docker --no-pager -l
        return 1
    fi
}

# 5. コンテナの修復
fix_container() {
    print_status "aivisspeech-engine コンテナを修復中..."
    
    # コンテナの停止と削除
    print_warning "問題のあるコンテナを削除中..."
    docker stop aivisspeech-engine 2>/dev/null || true
    docker rm aivisspeech-engine 2>/dev/null || true
    
    # イメージの確認
    print_status "利用可能なイメージを確認中..."
    docker images | grep -i aivis || docker images | head -5
    echo ""
    
    print_status "コンテナを再作成してください。例："
    echo "docker run -d --name aivisspeech-engine --runtime=nvidia [その他のオプション] [イメージ名]"
    echo ""
    echo "または、NVIDIAランタイムを使用しない場合："
    echo "docker run -d --name aivisspeech-engine [その他のオプション] [イメージ名]"
}

# 6. 動作確認
verify_setup() {
    print_status "設定の動作確認中..."
    
    echo "=== Docker情報 ==="
    docker info | grep -i runtime || true
    echo ""
    
    echo "=== NVIDIA Container Runtime テスト ==="
    if command -v nvidia-smi &> /dev/null; then
        print_status "nvidia-smi が利用可能です"
        nvidia-smi --version
        
        # NVIDIA Dockerテスト
        print_status "NVIDIA Docker テスト実行中..."
        docker run --rm --runtime=nvidia nvidia/cuda:11.0-base nvidia-smi 2>&1 || {
            print_warning "NVIDIA Dockerテストに失敗しました（GPU不要なコンテナの場合は正常）"
        }
    else
        print_warning "nvidia-smi が見つかりません（GPU不要な環境の場合は正常）"
    fi
    
    print_success "設定確認が完了しました"
}

# メイン実行
main() {
    print_status "Docker NVIDIA Container Runtime 修復を開始します..."
    
    check_current_status
    
    echo ""
    print_status "修復方法を選択してください:"
    echo "1) 完全修復（推奨）- NVIDIA toolkit再インストール + Docker設定修正"
    echo "2) Docker設定のみ修正"
    echo "3) コンテナのみ修復"
    echo "4) 診断のみ実行"
    echo ""
    
    read -p "選択してください (1-4): " choice
    
    case $choice in
        1)
            reinstall_nvidia_toolkit
            configure_docker
            restart_docker
            fix_container
            verify_setup
            ;;
        2)
            configure_docker
            restart_docker
            verify_setup
            ;;
        3)
            fix_container
            ;;
        4)
            print_status "診断情報は上記に表示されています"
            ;;
        *)
            print_error "無効な選択です"
            exit 1
            ;;
    esac
    
    echo ""
    print_success "Docker NVIDIA Container Runtime 修復が完了しました"
    echo ""
    print_status "次のステップ:"
    echo "1. docker start aivisspeech-engine を再実行"
    echo "2. 問題が続く場合は、コンテナを再作成"
    echo "3. ログファイルで詳細を確認: journalctl -u docker"
}

# スクリプト実行
main "$@"
