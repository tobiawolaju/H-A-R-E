const wallet = require('../tools/wallet');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: 'wallet_ops',
    description: 'Create and manage encrypted wallet vaults, derive addresses, check balances, send funds, and sign messages or contract transactions across supported chains.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_wallet', 'import_wallet', 'list_wallets', 'get_address', 'get_balance', 'send_funds', 'sign_message', 'sign_contract', 'delete_wallet', 'list_supported_chains', 'migrate_wallet', 'confirm_migration'],
          description: 'Wallet action to perform'
        },
        walletRef: { type: 'string', description: 'Wallet id or label' },
        sourceWalletRef: { type: 'string', description: 'Wallet id, label, or current/latest for migration' },
        migrationId: { type: 'string', description: 'Migration id to confirm' },
        label: { type: 'string', description: 'Human-readable wallet label' },
        mnemonic: { type: 'string', description: 'Mnemonic seed phrase for import' },
        chains: { type: 'string', description: 'Comma-separated chain list, for example eth,solana,btc,sui' },
        chain: { type: 'string', description: 'Chain to target, for example eth, base, polygon, monad, hyperevm, solana, btc, btc-testnet, or sui' },
        to: { type: 'string', description: 'Destination address' },
        amount: { type: 'string', description: 'Amount in native units' },
        message: { type: 'string', description: 'Message to sign' },
        data: { type: 'string', description: 'Contract calldata or raw data to sign' },
        value: { type: 'string', description: 'Native value to include with a contract transaction' }
      },
      required: ['action']
    }
  },

  execute: async (args) => {
    const { action } = args;
    skill(`Wallet Ops: ${action}`);

    try {
      switch (action) {
        case 'create_wallet':
          return await wallet.createWallet(args);
        case 'import_wallet':
          return await wallet.importWallet(args);
        case 'list_wallets':
          return await wallet.listWallets();
        case 'get_address':
          return await wallet.getAddress(args);
        case 'get_balance':
          return await wallet.getBalance(args);
        case 'send_funds':
          return await wallet.sendFunds(args);
        case 'sign_message':
          return await wallet.signMessage(args);
        case 'sign_contract':
          return await wallet.signContract(args);
        case 'delete_wallet':
          return await wallet.deleteWallet(args);
        case 'list_supported_chains':
          return await wallet.listSupportedChains();
        case 'migrate_wallet':
          return await wallet.startMigration(args);
        case 'confirm_migration':
          return await wallet.confirmMigration(args);
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Wallet Ops Error: ${err.message}`;
    }
  }
};
