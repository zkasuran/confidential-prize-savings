// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ConfidentialPrizePool
/// @author zkasuran
/// @notice A confidential no-loss prize-savings pool (a private PoolTogether) built on
///         Zama FHEVM. Deposits, per-account balances, the prize pot and every award are
///         stored and computed fully encrypted. Depositors never lose principal; the
///         accrued prize is awarded each round to a deposit-weighted random depositor,
///         and the winner's identity is never revealed on-chain.
/// @dev Privacy model: the only value ever decrypted is the aggregate pool total
///      (`_totalDeposited`), revealed at draw time so a uniform ticket in [0, total) can
///      be drawn. Individual deposits, balances, the prize amount and the winner all stay
///      encrypted; a depositor learns they won by user-decrypting their own balance.
///      Deposit-weighting needs a plaintext modulus (FHE offers scalar-only `rem` and no
///      encrypted-modulo), so revealing only the aggregate is the minimal disclosure.
contract ConfidentialPrizePool is ZamaEthereumConfig, Ownable2Step, ReentrancyGuard {
    /// @notice The confidential ERC-7984 asset that is deposited and awarded (e.g. cUSD).
    ERC7984 public immutable asset;

    /// @notice Minimum time, in seconds, between draws.
    uint256 public drawInterval;

    enum DrawState {
        Idle,
        AwaitingTotal
    }

    /// @notice Whether a draw is mid-flight (waiting for the decrypted total).
    DrawState public drawState;

    /// @notice Completed-draw counter.
    uint256 public currentRound;

    /// @notice Timestamp of the last finalized draw.
    uint256 public lastDrawTime;

    /// @notice Plaintext pool total revealed at the most recent draw (public TVL).
    uint64 public lastRevealedTotal;

    /// @dev Encrypted per-account deposit balance.
    mapping(address account => euint64 balance) private _deposits;

    /// @dev Encrypted running total of all deposits (the only value ever decrypted).
    euint64 private _totalDeposited;

    /// @dev Encrypted accrued prize, funded by sponsors (simulated yield on testnet).
    euint64 private _prizePot;

    /// @notice Everyone who has ever deposited; iterated during the weighted draw.
    address[] public participants;

    /// @notice Whether an address is already tracked in `participants`.
    mapping(address account => bool tracked) public isParticipant;

    /// @notice Emitted when an account deposits into the pool.
    /// @param account the depositor
    event Deposited(address indexed account);

    /// @notice Emitted when an account withdraws principal from the pool.
    /// @param account the withdrawer
    event Withdrawn(address indexed account);

    /// @notice Emitted when an account funds the prize pot.
    /// @param sponsor the prize sponsor
    event PrizeSponsored(address indexed sponsor);

    /// @notice Emitted when a draw starts and the pool total is exposed for decryption.
    /// @param round the round being drawn
    /// @param totalHandle ciphertext handle of the aggregate total to publicly decrypt
    event DrawStarted(uint256 indexed round, bytes32 totalHandle);

    /// @notice Emitted when a draw is finalized and the prize is awarded to the hidden winner.
    /// @param round the round that was drawn
    /// @param revealedTotal the plaintext aggregate total used for the draw
    event DrawFinalized(uint256 indexed round, uint64 indexed revealedTotal);

    /// @notice Emitted when a pending draw is cancelled by the owner.
    /// @param round the round whose draw was cancelled
    event DrawCancelled(uint256 indexed round);

    error DrawInProgress();
    error NoDrawInProgress();
    error NoParticipants();
    error DrawTooSoon(uint256 earliest);
    error EmptyPool();

    modifier whenIdle() {
        if (drawState != DrawState.Idle) revert DrawInProgress();
        _;
    }

    constructor(address asset_, uint256 drawInterval_) Ownable(msg.sender) {
        asset = ERC7984(asset_);
        drawInterval = drawInterval_;
    }

    // ----------------------------------------------------------------- deposits

    /// @notice Deposit an encrypted amount of `asset`. The caller must first approve this
    ///         pool as an ERC-7984 operator (`asset.setOperator(pool, until)`).
    /// @param encryptedAmount external-handle encrypted deposit amount
    /// @param inputProof zero-knowledge proof attesting to the encrypted input
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant whenIdle {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 received = _pullFrom(msg.sender, amount);

        euint64 current = _deposits[msg.sender];
        euint64 newBalance = FHE.isInitialized(current) ? FHE.add(current, received) : received;
        _deposits[msg.sender] = newBalance;
        _totalDeposited = FHE.add(_totalDeposited, received);

        if (!isParticipant[msg.sender]) {
            isParticipant[msg.sender] = true;
            participants.push(msg.sender);
        }

        FHE.allowThis(newBalance);
        FHE.allow(newBalance, msg.sender);
        FHE.allowThis(_totalDeposited);

        emit Deposited(msg.sender);
    }

    /// @notice Withdraw up to your deposited balance. No-loss: principal is always
    ///         redeemable. A request larger than your balance withdraws nothing.
    /// @param encryptedAmount external-handle encrypted amount to withdraw
    /// @param inputProof zero-knowledge proof attesting to the encrypted input
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant whenIdle {
        euint64 request = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 balance = _deposits[msg.sender];

        // Clamp to the available balance so a caller can never withdraw more than they own.
        ebool ok = FHE.le(request, balance);
        euint64 amount = FHE.select(ok, request, FHE.asEuint64(0));

        euint64 newBalance = FHE.sub(balance, amount);
        _deposits[msg.sender] = newBalance;
        _totalDeposited = FHE.sub(_totalDeposited, amount);

        FHE.allowThis(newBalance);
        FHE.allow(newBalance, msg.sender);
        FHE.allowThis(_totalDeposited);

        FHE.allowTransient(amount, address(asset));
        asset.confidentialTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender);
    }

    /// @notice Fund the prize pot with an encrypted amount of `asset`. This models the
    ///         yield that funds PoolTogether prizes; on this testnet it is sponsor-supplied.
    ///         The caller must have approved this pool as an ERC-7984 operator.
    /// @param encryptedAmount external-handle encrypted amount to add to the prize pot
    /// @param inputProof zero-knowledge proof attesting to the encrypted input
    function sponsorPrize(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant whenIdle {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 received = _pullFrom(msg.sender, amount);

        _prizePot = FHE.add(_prizePot, received);
        FHE.allowThis(_prizePot);

        emit PrizeSponsored(msg.sender);
    }

    /// @dev Pull `amount` of `asset` from `from` into this pool and return the exact
    ///      encrypted amount received. ERC-7984 transfers clamp to the available balance
    ///      and the delta of the pool balance is the amount that actually arrived.
    function _pullFrom(address from, euint64 amount) private returns (euint64 received) {
        euint64 balanceBefore = asset.confidentialBalanceOf(address(this));
        FHE.allowTransient(amount, address(asset));
        asset.confidentialTransferFrom(from, address(this), amount);
        euint64 balanceAfter = asset.confidentialBalanceOf(address(this));
        received = FHE.sub(balanceAfter, balanceBefore);
    }

    // -------------------------------------------------------------------- draws

    /// @notice Begin a draw: expose the aggregate pool total for public decryption so a
    ///         uniform winning ticket can be drawn. Permissionless once the interval passes.
    function startDraw() external whenIdle {
        if (participants.length == 0) revert NoParticipants();
        uint256 earliest = lastDrawTime + drawInterval;
        if (block.timestamp < earliest) revert DrawTooSoon(earliest);

        FHE.makePubliclyDecryptable(_totalDeposited);
        drawState = DrawState.AwaitingTotal;

        emit DrawStarted(currentRound, FHE.toBytes32(_totalDeposited));
    }

    /// @notice Finalize a draw with the decrypted pool total and its signatures. Draws a
    ///         deposit-weighted random winner entirely under FHE and credits the encrypted
    ///         prize to them without revealing who won. Permissionless: the signatures make
    ///         the revealed total unforgeable and the FHE CSPRNG makes the ticket unbiasable.
    /// @param handles ciphertext handles that were publicly decrypted (the aggregate total)
    /// @param cleartexts ABI-encoded decrypted values returned by the relayer
    /// @param decryptionProof KMS signatures proving the decryption is authentic
    function finalizeDraw(
        bytes32[] calldata handles,
        bytes calldata cleartexts,
        bytes calldata decryptionProof
    ) external {
        if (drawState != DrawState.AwaitingTotal) revert NoDrawInProgress();
        FHE.checkSignatures(handles, cleartexts, decryptionProof);
        uint64 total = abi.decode(cleartexts, (uint64));
        if (total == 0) revert EmptyPool();

        // Uniform winning ticket in [0, total).
        euint64 ticket = FHE.rem(FHE.randEuint64(), total);
        euint64 pot = FHE.isInitialized(_prizePot) ? _prizePot : FHE.asEuint64(0);

        euint64 cumulative = FHE.asEuint64(0);
        uint256 n = participants.length;
        for (uint256 i = 0; i < n; ++i) {
            address account = participants[i];
            euint64 balance = _deposits[account];
            if (!FHE.isInitialized(balance)) continue;

            euint64 lower = cumulative;
            cumulative = FHE.add(cumulative, balance);

            // Winner iff the ticket lands in this account's half-open range [lower, cumulative).
            // Ranges partition [0, total) so exactly one initialized account matches.
            ebool won = FHE.and(FHE.ge(ticket, lower), FHE.lt(ticket, cumulative));
            euint64 newBalance = FHE.select(won, FHE.add(balance, pot), balance);

            _deposits[account] = newBalance;
            FHE.allowThis(newBalance);
            FHE.allow(newBalance, account);
        }

        // The prize has moved into the pool as the (hidden) winner's larger balance.
        _totalDeposited = FHE.add(_totalDeposited, pot);
        FHE.allowThis(_totalDeposited);
        _prizePot = FHE.asEuint64(0);
        FHE.allowThis(_prizePot);

        lastRevealedTotal = total;
        lastDrawTime = block.timestamp;
        drawState = DrawState.Idle;
        uint256 round = currentRound;
        currentRound = round + 1;

        emit DrawFinalized(round, total);
    }

    /// @notice Abort a stuck draw (e.g. the decryption was never submitted) and re-open
    ///         the pool. Balances are untouched.
    function cancelDraw() external onlyOwner {
        if (drawState != DrawState.AwaitingTotal) revert NoDrawInProgress();
        drawState = DrawState.Idle;
        emit DrawCancelled(currentRound);
    }

    /// @notice Update the minimum interval between draws.
    /// @param drawInterval_ new minimum number of seconds between draws
    function setDrawInterval(uint256 drawInterval_) external onlyOwner {
        drawInterval = drawInterval_;
    }

    // -------------------------------------------------------------------- views

    /// @notice Encrypted deposit balance of `account`. Only `account` and this contract
    ///         are permitted to decrypt it.
    /// @param account the account to read the encrypted balance of
    /// @return the encrypted deposit balance handle
    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _deposits[account];
    }

    /// @notice Encrypted prize pot currently up for grabs.
    function confidentialPrizePot() external view returns (euint64) {
        return _prizePot;
    }

    /// @notice Encrypted aggregate pool total.
    function confidentialTotalDeposited() external view returns (euint64) {
        return _totalDeposited;
    }

    /// @notice Ciphertext handle of the aggregate total (used to request public decryption).
    function totalDepositedHandle() external view returns (bytes32) {
        return FHE.toBytes32(_totalDeposited);
    }

    /// @notice Number of tracked participants.
    function participantCount() external view returns (uint256) {
        return participants.length;
    }
}
