// Minimal human-readable ABIs for the confidential prize-savings dApp.
// Encrypted inputs (externalEuint64) are bytes32 handles; encrypted balances are
// returned as bytes32 ciphertext handles that only the owner may decrypt.

export const TOKEN_ABI = [
  "function mint(address to, uint64 amount) returns (bytes32)",
  "function setOperator(address operator, uint48 until)",
  "function isOperator(address holder, address spender) view returns (bool)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

export const POOL_ABI = [
  "function deposit(bytes32 encryptedAmount, bytes inputProof)",
  "function withdraw(bytes32 encryptedAmount, bytes inputProof)",
  "function sponsorPrize(bytes32 encryptedAmount, bytes inputProof)",
  "function startDraw()",
  "function finalizeDraw(bytes32[] handles, bytes cleartexts, bytes decryptionProof)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function confidentialPrizePot() view returns (bytes32)",
  "function confidentialTotalDeposited() view returns (bytes32)",
  "function totalDepositedHandle() view returns (bytes32)",
  "function participantCount() view returns (uint256)",
  "function currentRound() view returns (uint256)",
  "function drawState() view returns (uint8)",
  "function lastRevealedTotal() view returns (uint64)",
  "function asset() view returns (address)",
  "function isParticipant(address account) view returns (bool)",
];
