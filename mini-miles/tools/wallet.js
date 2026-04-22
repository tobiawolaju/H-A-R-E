const crypto = require('crypto');
const path = require('path');
const axios = require('axios');
const fs = require('fs-extra');
const config = require('../config');
const { skill } = require('../utils/logger');

const VAULT_DIR = path.join(process.cwd(), '.mini-miles');
const VAULT_FILE = path.join(VAULT_DIR, 'wallet-vault.json');
const VAULT_KEY_FILE = path.join(VAULT_DIR, 'wallet-vault.key');
const MIGRATIONS_FILE = path.join(VAULT_DIR, 'wallet-migrations.json');

const optionalRequire = (name) => {
  try {
    return require(name);
  } catch {
    return null;
  }
};

const ethers = optionalRequire('ethers');
const bip39 = optionalRequire('bip39');
const ed25519HdKey = optionalRequire('ed25519-hd-key');
const solanaWeb3 = optionalRequire('@solana/web3.js');
const tinySecp256k1 = optionalRequire('tiny-secp256k1');
const bip32 = optionalRequire('bip32');
const bitcoinjs = optionalRequire('bitcoinjs-lib');
const tweetnacl = optionalRequire('tweetnacl');
const suiClientMod = optionalRequire('@mysten/sui/client');
const suiTxMod = optionalRequire('@mysten/sui/transactions');
const suiKeypairMod = optionalRequire('@mysten/sui/keypairs/ed25519');

const EVm_NETWORKS = {
  eth: { name: 'eth', rpcEnv: 'WALLET_RPC_URL_ETH', chainId: 1, symbol: 'ETH' },
  ethereum: { name: 'eth', rpcEnv: 'WALLET_RPC_URL_ETH', chainId: 1, symbol: 'ETH' },
  monad: { name: 'monad', rpcEnv: 'WALLET_RPC_URL_MONAD', chainId: 143, symbol: 'MON' },
  base: { name: 'base', rpcEnv: 'WALLET_RPC_URL_BASE', chainId: 8453, symbol: 'ETH' },
  polygon: { name: 'polygon', rpcEnv: 'WALLET_RPC_URL_POLYGON', chainId: 137, symbol: 'MATIC' },
  hyperevm: { name: 'hyperevm', rpcEnv: 'WALLET_RPC_URL_HYPEREVM', chainId: 999, symbol: 'ETH' },
  hyperEVM: { name: 'hyperevm', rpcEnv: 'WALLET_RPC_URL_HYPEREVM', chainId: 999, symbol: 'ETH' }
};

function normalizeChain(chain) {
  const value = String(chain || 'eth').trim().toLowerCase();
  if (EVm_NETWORKS[value]) return EVm_NETWORKS[value].name;
  return value;
}

function normalizeChainList(chains) {
  const raw = Array.isArray(chains) ? chains : String(chains || '').split(',');
  const values = raw
    .map((value) => normalizeChain(value))
    .filter(Boolean);
  return Array.from(new Set(values.length > 0 ? values : ['eth', 'solana', 'btc', 'sui']));
}

async function ensureVault() {
  await fs.ensureDir(VAULT_DIR);
  if (!(await fs.pathExists(VAULT_FILE))) {
    await fs.writeJson(VAULT_FILE, { wallets: [] }, { spaces: 2 });
  }
  if (!(await fs.pathExists(MIGRATIONS_FILE))) {
    await fs.writeJson(MIGRATIONS_FILE, { migrations: [] }, { spaces: 2 });
  }
}

function getVaultPassphrase() {
  if (config.WALLET_VAULT_PASSPHRASE) return config.WALLET_VAULT_PASSPHRASE;
  if (!process.env.WALLET_VAULT_PASSPHRASE) {
    if (!fs.pathExistsSync(VAULT_KEY_FILE)) {
      const key = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(VAULT_KEY_FILE, key, 'utf8');
      return key;
    }
    return fs.readFileSync(VAULT_KEY_FILE, 'utf8').trim();
  }
  return process.env.WALLET_VAULT_PASSPHRASE;
}

function encryptText(text) {
  const passphrase = getVaultPassphrase();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }), 'utf8').toString('base64');
}

function decryptText(payload) {
  const passphrase = getVaultPassphrase();
  const decoded = JSON.parse(Buffer.from(String(payload), 'base64').toString('utf8'));
  const salt = Buffer.from(decoded.salt, 'base64');
  const iv = Buffer.from(decoded.iv, 'base64');
  const tag = Buffer.from(decoded.tag, 'base64');
  const ciphertext = Buffer.from(decoded.ciphertext, 'base64');
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

async function readVault() {
  await ensureVault();
  return fs.readJson(VAULT_FILE);
}

async function writeVault(vault) {
  await ensureVault();
  await fs.writeJson(VAULT_FILE, vault, { spaces: 2 });
}

async function readMigrations() {
  await ensureVault();
  return fs.readJson(MIGRATIONS_FILE);
}

async function writeMigrations(migrations) {
  await ensureVault();
  await fs.writeJson(MIGRATIONS_FILE, migrations, { spaces: 2 });
}

function getMnemonicFromRecord(record) {
  if (!record?.mnemonicEncrypted) throw new Error('Wallet record is missing encrypted mnemonic');
  return decryptText(record.mnemonicEncrypted);
}

function randomWalletLabel(prefix = 'wallet') {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function deriveEvmWallet(mnemonic) {
  if (!ethers || !bip39) throw new Error('Missing wallet dependencies for EVM derivation');
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return {
    address: wallet.address,
    wallet
  };
}

function deriveSolanaKeypair(mnemonic) {
  if (!bip39 || !ed25519HdKey || !solanaWeb3) throw new Error('Missing wallet dependencies for Solana derivation');
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const derived = ed25519HdKey.derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
  const secret = derived.key.slice(0, 32);
  const keypair = solanaWeb3.Keypair.fromSeed(secret);
  return {
    address: keypair.publicKey.toBase58(),
    keypair
  };
}

function getBitcoinNetwork(chain) {
  return chain === 'btc-testnet'
    ? bitcoinjs.networks.testnet
    : bitcoinjs.networks.bitcoin;
}

function deriveBtcKeypair(mnemonic, chain = 'btc') {
  if (!bip39 || !bip32 || !tinySecp256k1 || !bitcoinjs) throw new Error('Missing wallet dependencies for Bitcoin derivation');
  const factory = bip32.BIP32Factory ? bip32.BIP32Factory(tinySecp256k1) : bip32.default?.BIP32Factory?.(tinySecp256k1);
  const nodeFactory = factory || bip32.BIP32Factory(tinySecp256k1);
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const network = getBitcoinNetwork(chain);
  const root = nodeFactory.fromSeed(seed, network);
  const account = root.derivePath(chain === 'btc-testnet' ? "m/84'/1'/0'/0/0" : "m/84'/0'/0'/0/0");
  const payment = bitcoinjs.payments.p2wpkh({ pubkey: account.publicKey, network });
  return {
    address: payment.address,
    node: account,
    network
  };
}

function deriveSuiKeypair(mnemonic) {
  if (!suiKeypairMod || !bip39) throw new Error('Missing wallet dependencies for Sui derivation');
  const keypair = suiKeypairMod.Ed25519Keypair.deriveKeypair(mnemonic, "m/44'/784'/0'/0'/0'");
  return {
    address: keypair.getPublicKey().toSuiAddress(),
    keypair
  };
}

async function deriveWalletSnapshot(mnemonic, chains) {
  const snapshot = {};
  for (const chain of chains) {
    if (chain === 'solana') {
      snapshot.solana = deriveSolanaKeypair(mnemonic).address;
      continue;
    }
    if (chain === 'btc' || chain === 'btc-testnet') {
      snapshot[chain] = deriveBtcKeypair(mnemonic, chain).address;
      continue;
    }
    if (chain === 'sui') {
      snapshot.sui = deriveSuiKeypair(mnemonic).address;
      continue;
    }

    const evm = EVm_NETWORKS[chain];
    if (evm) {
      snapshot[evm.name] = deriveEvmWallet(mnemonic).address;
    }
  }
  return snapshot;
}

function getEvmProvider(chain) {
  if (!ethers) throw new Error('Missing dependency: ethers');
  const meta = EVm_NETWORKS[chain];
  if (!meta) throw new Error(`Unsupported EVM chain: ${chain}`);
  const rpcUrl = process.env[meta.rpcEnv];
  if (!rpcUrl) throw new Error(`Missing RPC URL for ${meta.name}. Set ${meta.rpcEnv}.`);
  return new ethers.JsonRpcProvider(rpcUrl, meta.chainId);
}

function getEvmWallet(mnemonic, chain) {
  const meta = EVm_NETWORKS[chain];
  if (!meta) throw new Error(`Unsupported EVM chain: ${chain}`);
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return { wallet, provider: getEvmProvider(chain), meta };
}

function getWallet(recordOrId, vault) {
  const query = String(recordOrId || '').trim().toLowerCase();
  const record = vault.wallets.find((item) =>
    item.id.toLowerCase() === query ||
    String(item.label || '').toLowerCase() === query
  );
  if (!record) throw new Error(`Wallet not found: ${recordOrId}`);
  return record;
}

function getSourceWallet(recordOrId, vault) {
  const query = String(recordOrId || '').trim().toLowerCase();
  if (!query || query === 'current' || query === 'latest' || query === 'most recent') {
    const ordered = [...vault.wallets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (ordered.length === 0) throw new Error('No wallets available');
    return ordered[0];
  }
  return getWallet(recordOrId, vault);
}

function toBigIntAmount(amount, decimals) {
  const value = String(amount || '').trim();
  if (!value) throw new Error('Amount is required');
  const [whole, frac = ''] = value.split('.');
  const padded = `${whole}${(frac + '0'.repeat(decimals)).slice(0, decimals)}`;
  return BigInt(padded || '0');
}

function formatWalletRecord(record) {
  return {
    id: record.id,
    label: record.label,
    createdAt: record.createdAt,
    chains: record.chains,
    addresses: record.addresses
  };
}

function formatChainSummary(chains) {
  return Array.from(new Set((chains || []).map((chain) => normalizeChain(chain)))).sort();
}

function getAllSupportedMigrationChains() {
  return ['eth', 'base', 'polygon', 'monad', 'hyperevm', 'solana', 'btc', 'sui'];
}

async function createWallet({ label, chains }) {
  if (!ethers || !bip39) {
    return 'Error: wallet creation needs `ethers` and `bip39` installed.';
  }

  const mnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
  const selectedChains = normalizeChainList(chains);
  const addresses = await deriveWalletSnapshot(mnemonic, selectedChains);
  const record = {
    id: crypto.randomUUID(),
    label: label || randomWalletLabel('wallet'),
    chains: selectedChains,
    mnemonicEncrypted: encryptText(mnemonic),
    addresses,
    createdAt: new Date().toISOString()
  };

  const vault = await readVault();
  vault.wallets.push(record);
  await writeVault(vault);

  return JSON.stringify({
    wallet: formatWalletRecord(record),
    seedphraseProtected: true,
    note: 'The mnemonic is encrypted in the local wallet vault. Set WALLET_VAULT_PASSPHRASE to control vault encryption.'
  }, null, 2);
}

async function importWallet({ mnemonic, label, chains }) {
  if (!mnemonic) return 'Error: mnemonic is required for import.';
  const selectedChains = normalizeChainList(chains);
  const addresses = await deriveWalletSnapshot(mnemonic, selectedChains);
  const record = {
    id: crypto.randomUUID(),
    label: label || randomWalletLabel('imported'),
    chains: selectedChains,
    mnemonicEncrypted: encryptText(mnemonic),
    addresses,
    createdAt: new Date().toISOString()
  };

  const vault = await readVault();
  vault.wallets.push(record);
  await writeVault(vault);

  return JSON.stringify({ wallet: formatWalletRecord(record), seedphraseProtected: true }, null, 2);
}

async function listWallets() {
  const vault = await readVault();
  return JSON.stringify(vault.wallets.map(formatWalletRecord), null, 2);
}

async function getAddress({ walletRef, chain }) {
  const vault = await readVault();
  const record = getWallet(walletRef, vault);
  const chainKey = normalizeChain(chain);
  if (record.addresses[chainKey]) {
    return JSON.stringify({ wallet: formatWalletRecord(record), chain: chainKey, address: record.addresses[chainKey] }, null, 2);
  }

  const mnemonic = getMnemonicFromRecord(record);
  const snapshot = await deriveWalletSnapshot(mnemonic, [chainKey]);
  return JSON.stringify({ wallet: formatWalletRecord(record), chain: chainKey, address: snapshot[chainKey] }, null, 2);
}

async function getBalance({ walletRef, chain }) {
  const vault = await readVault();
  const record = getWallet(walletRef, vault);
  const mnemonic = getMnemonicFromRecord(record);
  const chainKey = normalizeChain(chain);

  if (chainKey === 'solana') {
    if (!solanaWeb3) throw new Error('Missing dependency: @solana/web3.js');
    const { address } = deriveSolanaKeypair(mnemonic);
    const connection = new solanaWeb3.Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const lamports = await connection.getBalance(new solanaWeb3.PublicKey(address));
    return JSON.stringify({ chain: 'solana', address, balance: lamports / solanaWeb3.LAMPORTS_PER_SOL, unit: 'SOL', raw: lamports }, null, 2);
  }

  if (chainKey === 'sui') {
    if (!suiClientMod) throw new Error('Missing dependency: @mysten/sui');
    const { address } = deriveSuiKeypair(mnemonic);
    const client = new suiClientMod.SuiClient({ url: process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443' });
    const balance = await client.getBalance({ owner: address });
    return JSON.stringify({ chain: 'sui', address, balance: balance.totalBalance, coinType: balance.coinType }, null, 2);
  }

  if (chainKey === 'btc' || chainKey === 'btc-testnet') {
    const { address } = deriveBtcKeypair(mnemonic, chainKey);
    const baseUrl = config.BTC_MEMPOOL_BASE_URL || 'https://mempool.space';
    const endpoint = chainKey === 'btc-testnet'
      ? `${baseUrl.replace(/\/$/, '')}/testnet/api/address/${address}`
      : `${baseUrl.replace(/\/$/, '')}/api/address/${address}`;
    const { data } = await axios.get(endpoint, { timeout: 30000 });
    const funded = Number(data.chain_stats.funded_txo_sum || 0) + Number(data.mempool_stats.funded_txo_sum || 0);
    const spent = Number(data.chain_stats.spent_txo_sum || 0) + Number(data.mempool_stats.spent_txo_sum || 0);
    const sats = funded - spent;
    return JSON.stringify({ chain: chainKey, address, balance: sats / 1e8, unit: 'BTC', raw: sats }, null, 2);
  }

  const evm = EVm_NETWORKS[chainKey];
  if (evm) {
    const { wallet } = deriveEvmWallet(mnemonic);
    const provider = getEvmProvider(chainKey);
    const balance = await provider.getBalance(wallet.address);
    return JSON.stringify({ chain: chainKey, address: wallet.address, balance: ethers.formatEther(balance), unit: evm.symbol, raw: balance.toString() }, null, 2);
  }

  throw new Error(`Unsupported chain: ${chain}`);
}

async function sendFunds({ walletRef, chain, to, amount }) {
  const vault = await readVault();
  const record = getWallet(walletRef, vault);
  const mnemonic = getMnemonicFromRecord(record);
  const chainKey = normalizeChain(chain);

  if (chainKey === 'solana') {
    if (!solanaWeb3) throw new Error('Missing dependency: @solana/web3.js');
    const { keypair } = deriveSolanaKeypair(mnemonic);
    const connection = new solanaWeb3.Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const lamports = Math.round(Number(amount) * solanaWeb3.LAMPORTS_PER_SOL);
    const tx = new solanaWeb3.Transaction().add(
      solanaWeb3.SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new solanaWeb3.PublicKey(to),
        lamports
      })
    );
    const signature = await solanaWeb3.sendAndConfirmTransaction(connection, tx, [keypair]);
    return JSON.stringify({ chain: 'solana', from: keypair.publicKey.toBase58(), to, amount, signature }, null, 2);
  }

  if (chainKey === 'sui') {
    if (!suiClientMod || !suiTxMod || !suiKeypairMod) throw new Error('Missing dependency: @mysten/sui');
    const { keypair } = deriveSuiKeypair(mnemonic);
    const client = new suiClientMod.SuiClient({ url: process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443' });
    const tx = new suiTxMod.Transaction();
    const amountMist = toBigIntAmount(amount, 9);
    const [coin] = tx.splitCoins(tx.gas, [tx.pure(amountMist)]);
    tx.transferObjects([coin], tx.pure(to));
    const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
    return JSON.stringify({ chain: 'sui', from: keypair.getPublicKey().toSuiAddress(), to, amount, result }, null, 2);
  }

  if (chainKey === 'btc' || chainKey === 'btc-testnet') {
    if (!bitcoinjs || !bip39 || !bip32 || !tinySecp256k1) throw new Error('Missing Bitcoin wallet dependencies');
    const { node, network, address } = deriveBtcKeypair(mnemonic, chainKey);
    const baseUrl = config.BTC_MEMPOOL_BASE_URL || 'https://mempool.space';
    const apiBase = baseUrl.replace(/\/$/, '');
    const addressApi = chainKey === 'btc-testnet' ? `${apiBase}/testnet/api` : `${apiBase}/api`;
    const utxoResp = await axios.get(`${addressApi}/address/${address}/utxo`, { timeout: 30000 });
    const utxos = utxoResp.data || [];
    if (utxos.length === 0) throw new Error('No spendable BTC UTXOs found');

    const satoshisToSend = toBigIntAmount(amount, 8);
    const psbt = new bitcoinjs.Psbt({ network });
    let total = 0n;
    const feeRate = BigInt(String(process.env.BTC_FEE_RATE || '5'));
    const inputCount = utxos.length;
    for (const utxo of utxos) {
      const txHexResp = await axios.get(`${addressApi}/tx/${utxo.txid}/hex`, { timeout: 30000 });
      const txHex = txHexResp.data;
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(txHex, 'hex')
      });
      total += BigInt(utxo.value);
    }

    const payee = bitcoinjs.payments.p2wpkh({ pubkey: node.publicKey, network }).address;
    const roughFee = BigInt(180 * inputCount + 2 * 34 + 10) * feeRate;
    const change = total - satoshisToSend - roughFee;
    if (change < 0n) throw new Error('Insufficient BTC balance for amount plus fee');

    psbt.addOutput({ address: to, value: Number(satoshisToSend) });
    if (change > 546n) {
      psbt.addOutput({ address: payee, value: Number(change) });
    }

    psbt.signAllInputs(node);
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction().toHex();
    const broadcast = await axios.post(`${addressApi}/tx`, tx, { timeout: 30000 });
    return JSON.stringify({ chain: chainKey, from: address, to, amount, txid: broadcast.data, rawTx: tx }, null, 2);
  }

  const evm = EVm_NETWORKS[chainKey];
  if (evm) {
    const { wallet, provider } = getEvmWallet(mnemonic, chainKey);
    const tx = await wallet.connect(provider).sendTransaction({
      to,
      value: ethers.parseEther(String(amount))
    });
    await tx.wait();
    return JSON.stringify({ chain: chainKey, from: wallet.address, to, amount, hash: tx.hash }, null, 2);
  }

  throw new Error(`Unsupported chain: ${chain}`);
}

async function signMessage({ walletRef, chain, message }) {
  const vault = await readVault();
  const record = getWallet(walletRef, vault);
  const mnemonic = getMnemonicFromRecord(record);
  const chainKey = normalizeChain(chain);

  if (chainKey === 'solana') {
    if (!solanaWeb3 || !tweetnacl) throw new Error('Missing dependency: @solana/web3.js or tweetnacl');
    const { keypair } = deriveSolanaKeypair(mnemonic);
    const signature = tweetnacl.sign.detached(Buffer.from(String(message), 'utf8'), keypair.secretKey);
    return JSON.stringify({ chain: 'solana', address: keypair.publicKey.toBase58(), signature: Buffer.from(signature).toString('base64') }, null, 2);
  }

  if (chainKey === 'sui') {
    const { keypair } = deriveSuiKeypair(mnemonic);
    if (typeof keypair.signPersonalMessage === 'function') {
      const signed = await keypair.signPersonalMessage(Buffer.from(String(message), 'utf8'));
      return JSON.stringify({ chain: 'sui', address: keypair.getPublicKey().toSuiAddress(), signature: signed }, null, 2);
    }
    return 'Error: Sui personal message signing is unavailable in this SDK build.';
  }

  const evm = EVm_NETWORKS[chainKey];
  if (evm) {
    const { wallet } = deriveEvmWallet(mnemonic);
    const signature = await wallet.signMessage(String(message));
    return JSON.stringify({ chain: chainKey, address: wallet.address, signature }, null, 2);
  }

  throw new Error(`Unsupported chain: ${chain}`);
}

async function signContract({ walletRef, chain, to, data, value }) {
  const vault = await readVault();
  const record = getWallet(walletRef, vault);
  const mnemonic = getMnemonicFromRecord(record);
  const chainKey = normalizeChain(chain);
  const evm = EVm_NETWORKS[chainKey];
  if (!evm) throw new Error('Contract signing is currently only supported for EVM chains.');
  const { wallet, provider } = getEvmWallet(mnemonic, chainKey);
  const tx = await wallet.connect(provider).signTransaction({
    to,
    data,
    value: value ? ethers.parseEther(String(value)) : 0n,
    chainId: evm.chainId,
    nonce: await provider.getTransactionCount(wallet.address)
  });
  return JSON.stringify({ chain: chainKey, address: wallet.address, signedTransaction: tx }, null, 2);
}

async function deleteWallet({ walletRef }) {
  const vault = await readVault();
  const query = String(walletRef || '').trim().toLowerCase();
  const before = vault.wallets.length;
  vault.wallets = vault.wallets.filter((item) =>
    item.id.toLowerCase() !== query &&
    String(item.label || '').toLowerCase() !== query
  );
  if (vault.wallets.length === before) {
    return `Error: Wallet not found: ${walletRef}`;
  }
  await writeVault(vault);
  return `Wallet removed: ${walletRef}`;
}

async function startMigration({ sourceWalletRef, chains }) {
  const vault = await readVault();
  const source = getSourceWallet(sourceWalletRef, vault);
  const selectedChains = formatChainSummary(chains && String(chains).trim() ? chains.split(',') : getAllSupportedMigrationChains());
  const mnemonic = ethers?.Wallet?.createRandom?.().mnemonic?.phrase;
  if (!mnemonic) {
    throw new Error('Missing dependency: ethers is required to create the destination wallet');
  }

  const destinationAddresses = await deriveWalletSnapshot(mnemonic, selectedChains);
  const destination = {
    id: crypto.randomUUID(),
    label: `${source.label || 'wallet'}-migration-${crypto.randomBytes(2).toString('hex')}`,
    chains: selectedChains,
    mnemonicEncrypted: encryptText(mnemonic),
    addresses: destinationAddresses,
    createdAt: new Date().toISOString()
  };

  vault.wallets.push(destination);
  await writeVault(vault);

  const migrations = await readMigrations();
  const migration = {
    id: crypto.randomUUID(),
    sourceWalletId: source.id,
    sourceWalletLabel: source.label,
    destinationWalletId: destination.id,
    destinationWalletLabel: destination.label,
    chains: selectedChains,
    status: 'pending_confirmation',
    createdAt: new Date().toISOString()
  };
  migrations.migrations.push(migration);
  await writeMigrations(migrations);

  return JSON.stringify({
    migrationId: migration.id,
    status: migration.status,
    sourceWallet: formatWalletRecord(source),
    destinationWallet: formatWalletRecord(destination),
    confirmation: `Reply with !wallet confirm ${migration.id} to move supported native assets from ${source.label || source.id} to ${destination.label}.`
  }, null, 2);
}

async function confirmMigration({ migrationId }) {
  const migrations = await readMigrations();
  const migration = migrations.migrations.find((item) => item.id === migrationId);
  if (!migration) {
    throw new Error(`Migration not found: ${migrationId}`);
  }
  if (migration.status !== 'pending_confirmation') {
    return JSON.stringify({ migrationId, status: migration.status }, null, 2);
  }

  const vault = await readVault();
  const source = vault.wallets.find((item) => item.id === migration.sourceWalletId);
  const destination = vault.wallets.find((item) => item.id === migration.destinationWalletId);
  if (!source || !destination) {
    throw new Error('Source or destination wallet missing from vault');
  }

  const moves = [];
  const sourceMnemonic = getMnemonicFromRecord(source);
  const destinationMnemonic = getMnemonicFromRecord(destination);
  const destinationSnapshot = await deriveWalletSnapshot(destinationMnemonic, migration.chains);

  for (const chain of migration.chains) {
    const chainKey = normalizeChain(chain);
    const destinationAddress = destinationSnapshot[chainKey] || destination.addresses[chainKey];
    if (!destinationAddress) {
      moves.push({ chain: chainKey, skipped: true, reason: 'Destination address unavailable' });
      continue;
    }

    try {
      const balance = JSON.parse(await getBalance({ walletRef: source.id, chain: chainKey }));
      const raw = balance.raw ? BigInt(balance.raw) : 0n;
      if (raw === 0n) {
        moves.push({ chain: chainKey, skipped: true, reason: 'No balance' });
        continue;
      }

      if (chainKey === 'btc' || chainKey === 'btc-testnet') {
        const result = JSON.parse(await sendFunds({ walletRef: source.id, chain: chainKey, to: destinationAddress, amount: String(balance.balance) }));
        moves.push({ chain: chainKey, moved: true, result });
      } else if (chainKey === 'solana') {
        const result = JSON.parse(await sendFunds({ walletRef: source.id, chain: chainKey, to: destinationAddress, amount: String(balance.balance) }));
        moves.push({ chain: chainKey, moved: true, result });
      } else if (chainKey === 'sui') {
        const result = JSON.parse(await sendFunds({ walletRef: source.id, chain: chainKey, to: destinationAddress, amount: String(balance.balance) }));
        moves.push({ chain: chainKey, moved: true, result });
      } else {
        const result = JSON.parse(await sendFunds({ walletRef: source.id, chain: chainKey, to: destinationAddress, amount: String(balance.balance) }));
        moves.push({ chain: chainKey, moved: true, result });
      }
    } catch (err) {
      moves.push({ chain: chainKey, skipped: true, reason: err.message });
    }
  }

  const sourceIndex = vault.wallets.findIndex((item) => item.id === source.id);
  const hasFailure = moves.some((move) => move.skipped && move.reason && !/No balance|Destination address unavailable/i.test(move.reason));
  if (!hasFailure && sourceIndex >= 0) {
    vault.wallets.splice(sourceIndex, 1);
    await writeVault(vault);
    migration.status = 'confirmed';
    migration.confirmedAt = new Date().toISOString();
    migration.sourceDeleted = true;
  } else {
    await writeVault(vault);
    migration.status = 'partial';
    migration.confirmedAt = new Date().toISOString();
    migration.sourceDeleted = false;
  }
  migration.moves = moves;
  await writeMigrations(migrations);

  return JSON.stringify({
    migrationId,
    status: migration.status,
    sourceDeleted: Boolean(migration.sourceDeleted),
    destinationWallet: formatWalletRecord(destination),
    moves
  }, null, 2);
}

async function listSupportedChains() {
  return JSON.stringify({
    evm: Object.values(EVm_NETWORKS).map((item) => item.name).filter((v, idx, arr) => arr.indexOf(v) === idx),
    solana: true,
    btc: true,
    sui: true
  }, null, 2);
}

module.exports = {
  createWallet,
  importWallet,
  listWallets,
  getAddress,
  getBalance,
  sendFunds,
  signMessage,
  signContract,
  deleteWallet,
  listSupportedChains
  ,
  startMigration,
  confirmMigration
};
