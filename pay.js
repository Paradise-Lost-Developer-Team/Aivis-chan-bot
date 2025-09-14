document.addEventListener('DOMContentLoaded', () => {
  function qs(){return new URLSearchParams(location.search)}
  const q = qs();
  const receiver = q.get('receiver');
  const lamports = parseInt(q.get('amountLamports')||'0',10);
  const invoiceId = q.get('invoiceId') || '';
  const rpc = q.get('rpc') || '';
  const info = document.getElementById('info');
  if(!receiver || !lamports){
    if (info) info.innerText='missing params';
    return;
  }
  const sol = lamports/1e9;
  const label = encodeURIComponent('Aivis Payment');
  const message = encodeURIComponent(invoiceId);
  const url = `solana:${receiver}?amount=${sol}&label=${label}&message=${message}`;
  info.innerHTML = `<p>Receiver: <code>${receiver}</code><br>Amount: <strong>${sol} SOL</strong><br>Invoice: <code>${invoiceId}</code></p>`;
  // QR via Google Chart API (lightweight demo)
  const qr = document.getElementById('qr');
  const qrUrl = 'https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl='+encodeURIComponent(url);
  if (qr) qr.innerHTML = `<img src="${qrUrl}" alt="QR" width="300" height="300">`;
  const openLink = document.getElementById('openLink');
  if (openLink) {
    openLink.href = url;
    openLink.innerText = 'Open in wallet';
  }
});
