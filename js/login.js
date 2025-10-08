// エラーメッセージの表示
const urlParams = new URLSearchParams(window.location.search);
const error = urlParams.get('error');
const message = urlParams.get('message');

if (error || message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.classList.add('show');
    
    const errorMessages = {
        'auth_failed': 'ログインに失敗しました。もう一度お試しください。',
        'missing_version': 'バージョンパラメータが必要です。ログインボタンからアクセスしてください。',
        'invalid_version': '無効なバージョンが指定されました。',
        'version_mismatch': '認証バージョンが一致しません。正しいバージョンでログインしてください。'
    };
    
    errorDiv.textContent = message ? decodeURIComponent(message) : (errorMessages[error] || 'エラーが発生しました: ' + error);
}