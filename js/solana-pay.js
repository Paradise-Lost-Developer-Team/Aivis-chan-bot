// Minimal Solana payment helper for Phantom
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
