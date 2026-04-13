/**
 * SovadGs contract ABI
 * Claim distribution contract for GS (G$) ERC20 token
 * Deployed on Celo mainnet
 */
export const sovadGsAbi = [
  // Admin management
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'addAdmin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'removeAdmin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Top-up / withdraw
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'adminTopup',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'adminWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Direct send (admin only)
  {
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'claimDirect',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Initiate claim (user callable)
  {
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'bytes32', name: 'ref', type: 'bytes32' },
    ],
    name: 'initiateClaim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Distribute claims (admin only)
  {
    inputs: [{ internalType: 'bytes32[]', name: 'refs', type: 'bytes32[]' }],
    name: 'claimDateClaim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Cancel claim
  {
    inputs: [{ internalType: 'bytes32', name: 'ref', type: 'bytes32' }],
    name: 'cancelClaim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Batch send (admin only)
  {
    inputs: [
      { internalType: 'address[]', name: 'recipients', type: 'address[]' },
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
    ],
    name: 'batchSend',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Whitelist / blacklist
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'blacklistAddress',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'unblacklistAddress',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'whitelistAddress',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bool', name: 'enabled', type: 'bool' }],
    name: 'setWhitelistEnabled',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Read functions
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'claims',
    outputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint8', name: 'status', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'blacklist',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'whitelist',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'whitelistEnabled',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'gsToken',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'ref', type: 'bytes32' },
      { indexed: true, internalType: 'address', name: 'recipient', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'ClaimInitiated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'ref', type: 'bytes32' },
      { indexed: true, internalType: 'address', name: 'recipient', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'ClaimDistributed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'recipient', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'ClaimDirect',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'ref', type: 'bytes32' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'ClaimCancelled',
    type: 'event',
  },
] as const
