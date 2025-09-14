import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const RECEIVER_PUBKEY = process.env.SOLANA_RECEIVER_PUBKEY || '';

export function getConnection(): Connection {
  return new Connection(RPC_URL, 'confirmed');
}

export function getReceiverPublicKey(): PublicKey {
  if (!RECEIVER_PUBKEY) throw new Error('RECEIVER_PUBKEY is not configured');
  return new PublicKey(RECEIVER_PUBKEY);
}

export async function verifyTransaction(signature: string, expectedLamports: number): Promise<boolean> {
  const conn = getConnection();
  const tx = await conn.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
  if (!tx) return false;
  // サンプル: トランザクションの先頭の innerInstructions を見るより堅牢な検証を推奨
  const postBalances = tx.meta?.postBalances;
  const preBalances = tx.meta?.preBalances;

  // getAccountKeys may return a MessageAccountKeys object or an array depending on web3.js version,
  // so normalize to an array of PublicKey-like values before mapping to strings.
  const rawAccountKeys = (tx.transaction.message as any).getAccountKeys?.() ?? (tx.transaction.message as any).accountKeys ?? [];
  let accountKeys: string[];
  if (Array.isArray(rawAccountKeys)) {
    accountKeys = rawAccountKeys.map((k: any) => k.toString());
  } else if (rawAccountKeys.keys) {
    accountKeys = rawAccountKeys.keys.map((k: any) => k.toString());
  } else if (rawAccountKeys.staticAccountKeys) {
    accountKeys = rawAccountKeys.staticAccountKeys.map((k: any) => k.toString());
  } else {
    accountKeys = [];
  }

  const receiver = getReceiverPublicKey().toString();

  // 簡易検証: 受取アカウントが存在し、受け取り量が期待値以上なら true
  if (!postBalances || !preBalances) return false;

  // 受取アドレスの index を見つける
  const idx = accountKeys.indexOf(receiver);
  if (idx === -1) return false;

  const delta = postBalances[idx] - preBalances[idx];
  return delta >= expectedLamports;
}
