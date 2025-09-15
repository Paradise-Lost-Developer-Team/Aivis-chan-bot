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
      try {
        // Build user-friendly payment URLs (solana: URL and Phantom deep-link)
        const receiver = resp.receiver || '';
        const invoiceId = resp.invoiceId;
        const urls = createPaymentUrl({ receiver, currency, mint, amountLamports, invoiceId });
        showPayInfo(`請求書を作成しました。Invoice ID: ${invoiceId}\n支払いリンク: ${urls.solUrl}\nOpen in wallet: ${urls.phantomUrl}`);
      } catch (e) {
        // fallback to basic message
        showPayInfo(`請求書を作成しました。Invoice ID: ${resp.invoiceId}`);
      }
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

async function createInvoice(arg) {
  // Accept either a number (amountLamports) or an object { amountLamports, currency, mint }
  let amountLamports = null;
  let currency = null;
  let mint = null;
  if (typeof arg === 'number') {
    amountLamports = arg;
  } else if (arg && typeof arg === 'object') {
    amountLamports = arg.amountLamports;
    currency = arg.currency;
    mint = arg.mint;
  }
  if (!amountLamports || typeof amountLamports !== 'number') throw new Error('invalid amountLamports');

  const body = { amountLamports };
  if (currency) body.currency = currency;
  if (mint) body.mint = mint;

  // Create invoice on the web server (web will persist and call pro-premium for verify)
  const resp = await fetch(`/internal/solana/create-invoice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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

function formatSolAmount(lamports) {
  return (Number(lamports) / 1e9).toString();
}

function formatSplAmount(minorUnits, decimals = 6) {
  return (Number(minorUnits) / Math.pow(10, decimals)).toString();
}

function createPaymentUrl({ receiver, currency, mint, amountLamports, invoiceId }) {
  const cur = currency || 'sol';
  let amount = '';
  if (cur === 'spl') amount = formatSplAmount(amountLamports, 6);
  else amount = formatSolAmount(amountLamports);

  const label = encodeURIComponent('Aivis-chan Bot');
  const message = encodeURIComponent(`Invoice ${invoiceId}`);

  const base = `solana:${receiver}`;
  const params = [];
  params.push(`amount=${amount}`);
  if (cur === 'spl' && mint) params.push(`spl-token=${encodeURIComponent(mint)}`);
  params.push(`label=${label}`);
  params.push(`message=${message}`);

  const solUrl = `${base}?${params.join('&')}`;

  const phantomParams = new URLSearchParams();
  phantomParams.set('address', receiver);
  phantomParams.set('amount', amount);
  if (cur === 'spl' && mint) phantomParams.set('token', mint);
  phantomParams.set('reference', invoiceId);

  return solUrl
}

// UI helpers: render payment area (QR, links, buttons)
function renderPaymentArea(containerId, { solUrl, phantomUrl, receiver, amountLamports, currency, invoiceId }) {
  const container = document.getElementById(containerId) || document.body;
  // create or update area
  let area = container.querySelector('.solana-pay-area');
  if (!area) {
    area = document.createElement('div');
    area.className = 'solana-pay-area';
    // basic inline styles kept minimal for existing CSS
    area.style.padding = '12px';
    area.style.border = '1px solid rgba(0,0,0,0.08)';
    area.style.borderRadius = '8px';
    area.style.marginTop = '12px';
    container.appendChild(area);
  }

  const solDisplay = (currency === 'spl') ? formatSplAmount(amountLamports, 6) : formatSolAmount(amountLamports);

  // QR image (Google Chart API lightweight)
  const qrUrl = 'https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=' + encodeURIComponent(solUrl);

  area.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div class="solana-pay-qr" aria-hidden="false"><img src="${qrUrl}" alt="Payment QR code" width="160" height="160"></div>
      <div class="solana-pay-meta">
        <div><strong>Amount:</strong> ${solDisplay} ${currency === 'spl' ? '(token)' : 'SOL'}</div>
        <div><strong>Receiver:</strong> <code>${receiver}</code></div>
        <div><strong>Invoice:</strong> <code id="sol-invoice-id">${invoiceId}</code></div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn-copy-link" aria-label="Copy payment link">Copy link</button>
          <a class="btn-open-wallet" target="_blank" rel="noopener noreferrer" role="button" aria-label="Open in wallet">Open in wallet</a>
          <button type="button" class="btn-check-status" aria-label="Check payment status">Check status</button>
        </div>
        <div class="solana-pay-status" id="solana-pay-status" role="status" aria-live="polite" style="margin-top:8px"></div>
      </div>
    </div>
  `;

  const copyBtn = area.querySelector('.btn-copy-link');
  const openLink = area.querySelector('.btn-open-wallet');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(solUrl);
        showPayInfo('支払いリンクをコピーしました');
      } catch (e) {
        showPayError('リンクのコピーに失敗しました');
      }
    });
  }
  if (openLink) {
    openLink.href = phantomUrl || solUrl;
    openLink.innerText = 'Open in wallet';
  }
  const checkBtn = area.querySelector('.btn-check-status');
  const statusEl = area.querySelector('#solana-pay-status');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      try {
        if (statusEl) statusEl.textContent = 'Checking...';
        const resp = await checkInvoiceStatus(invoiceId);
        if (resp && resp.status === 'paid') {
          if (statusEl) {
            statusEl.textContent = 'Payment confirmed ✅';
            statusEl.style.color = 'green';
          }
          showPayInfo('支払いが確認されました');
        } else if (resp && resp.status === 'pending') {
          if (statusEl) {
            statusEl.textContent = 'Pending payment';
            statusEl.style.color = '#444';
          }
          showPayInfo('まだ支払いは確認されていません');
        } else {
          if (statusEl) {
            statusEl.textContent = 'No payment found';
            statusEl.style.color = 'orange';
          }
          showPayError('支払いが見つかりませんでした');
        }
      } catch (e) {
        if (statusEl) {
          statusEl.textContent = 'Error checking status';
          statusEl.style.color = 'red';
        }
        showPayError('支払い状況の確認に失敗しました');
      }
    });
  }
  return area;
}

async function checkInvoiceStatus(invoiceId) {
  if (!invoiceId) throw new Error('invoiceId required');
  const q = new URLSearchParams({ invoiceId });
  const resp = await fetch(`/internal/solana/invoice-status?${q.toString()}`, { method: 'GET' });
  if (!resp.ok) throw new Error('failed to fetch status');
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
