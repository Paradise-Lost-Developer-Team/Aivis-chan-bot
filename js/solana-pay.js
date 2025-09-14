// Minimal Solana payment helper for Phantom

// --- Payments form UX helpers ---
function showPayError(msg) {
  const el = document.getElementById('pay-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function clearPayError() { showPayError(''); }

// --- transient info/toast for non-blocking user messages ---
function showPayInfo(message, timeout = 5000) {
  if (!message) return;
  let toast = document.getElementById('pay-info-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pay-info-toast';
    toast.className = 'pay-info-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  // show via CSS class
  toast.classList.add('show');
  if (toast._removeTimer) clearTimeout(toast._removeTimer);
  toast._removeTimer = setTimeout(() => {
    try { toast.classList.remove('show'); } catch (e) {}
  }, timeout);
}

function parseAmount(value) {
  if (value === null || value === undefined) return NaN;
  const s = String(value).trim().replace(/,/g, '');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function handlePresetClick(e) {
  const v = e.currentTarget.getAttribute('data-value');
  const inp = document.getElementById('pay-amount');
  if (!inp) return;
  inp.value = v;
  clearPayError();
}

function handlePaymentsFormSubmit() {
  const inp = document.getElementById('pay-amount');
  if (!inp) return false;
  const val = parseAmount(inp.value);
  if (isNaN(val) || val <= 0) {
    showPayError('有効な支払額を入力してください（0 より大きい数字）');
    inp.focus();
    return false;
  }

  // Format to 6 decimal places for SOL display
  inp.value = String(Number(val.toFixed(6)));

  // Read currency selection
  const currency = (document.querySelector('input[name="pay-currency"]:checked') || {}).value || 'sol';
  const mint = document.getElementById('pay-mint') ? document.getElementById('pay-mint').value.trim() : '';

  // For now call createInvoice to persist invoice metadata (server currently accepts amountLamports)
  // Convert SOL to lamports if currency is 'sol'
  const amountLamports = currency === 'sol' ? Math.round(Number(inp.value) * 1e9) : Math.round(Number(inp.value) * 1e6); // for SPL assume 6 decimals by default

  createInvoice({ amountLamports, currency, mint }).then(resp => {
    if (resp && resp.invoiceId) {
      showPayInfo(`請求書を作成しました。Invoice ID: ${resp.invoiceId}`);
    } else {
      showPayError('請求書の作成に失敗しました');
    }
  }).catch(err => {
    console.error('createInvoice failed', err);
    showPayError('請求書の作成に失敗しました');
  });
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  const presets = document.querySelectorAll('.pay-presets .preset');
  presets.forEach(p => p.addEventListener('click', handlePresetClick));
  // currency selection UI: show/hide mint input
  const radios = document.querySelectorAll('input[name="pay-currency"]');
  const mintWrap = document.getElementById('pay-mint-wrap');
  if (radios && radios.length && mintWrap) {
    radios.forEach(r => r.addEventListener('change', () => {
      const cur = (document.querySelector('input[name="pay-currency"]:checked') || {}).value;
      mintWrap.style.display = cur === 'spl' ? 'block' : 'none';
    }));
  }
});
const PRO_PREMIUM_BASE = (window?.API_CONFIG?.baseURL && window.API_CONFIG.baseURL.includes('aivisspeech')) ? 'http://aivis-chan-bot-pro-premium:3012' : (window?.PRO_PREMIUM_BASE || 'http://aivis-chan-bot-pro-premium:3012');

async function createInvoice(amountLamports) {
  // Create invoice on the web server (web will persist and call pro-premium for verify)
  const resp = await fetch(`/internal/solana/create-invoice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountLamports })
  });
  return resp.json();
}

async function verifyPayment(signature, invoiceId, expectedLamports) {
  // Tell web server to confirm payment; web will call pro-premium verify and update invoice
  const resp = await fetch(`/internal/solana/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, invoiceId })
  });
  return resp.json();
}

export async function payWithPhantom(amountLamports) {
  if (!window.solana || !window.solana.isPhantom) throw new Error('Phantom wallet not found');
  await window.solana.connect();
  const pubkey = window.solana.publicKey.toString();
  const invoice = await createInvoice(amountLamports);
  const receiver = invoice.receiver;
  const rpc = invoice.rpc;

  // Build a simple transfer transaction via wallet's request
  const params = {
    to: receiver,
    amount: amountLamports
  };
  // Phantom がサポートする標準的な API で署名送信する例（実際の実装は wallet adapter を推奨）
  const { signature } = await window.solana.request({
    method: 'solana_signAndSendTransaction',
    params: params
  });

  // Verify with server
  const verify = await verifyPayment(signature, invoice.invoiceId, amountLamports);
  return verify;
}

// For pages to call
window.solanaPay = { payWithPhantom };
