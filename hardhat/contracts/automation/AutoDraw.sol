// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

/// @title AutoDraw — Chainlink Automation Keeper for Confidential Prize Draws
/// @author zkasuran
/// @notice Automates the prize draw lifecycle: checks if a draw is ready, starts
///         it when conditions are met, and finalizes it once the decrypted total is
///         available. This replaces manual draw triggering with trustless automation.
/// @dev Integrates with Chainlink Automation (v2.x Upkeep). Register this contract
///      as a Custom Logic upkeep on the Chainlink Automation dashboard. The keeper
///      network calls `checkUpkeep` off-chain every block, and if it returns true,
///      `performUpkeep` is called on-chain to advance the draw.
///
///      Draw lifecycle:
///        1. Idle + interval passed + participants > 0 → keeper calls startDraw()
///        2. AwaitingTotal + relayer posts decryption → keeper calls finalizeDraw()
///
///      The finalization step requires the decrypted total and KMS proof. Since these
///      come from the Zama relayer (off-chain), this keeper monitors a "ready" flag
///      set by a companion off-chain service that caches the decryption result.
///      In production, this would be a Chainlink Functions call or a dedicated relayer.

interface IConfidentialPrizePool {
    function drawState() external view returns (uint8);
    function participantCount() external view returns (uint256);
    function lastDrawTime() external view returns (uint256);
    function drawInterval() external view returns (uint256);
    function startDraw() external;
    function finalizeDraw(bytes32[] calldata handles, bytes calldata cleartexts, bytes calldata decryptionProof) external;
}

contract AutoDraw is AutomationCompatibleInterface {
    /// @notice The prize pool this keeper automates.
    IConfidentialPrizePool public immutable pool;

    /// @notice Cached finalization data posted by the off-chain relayer service.
    struct FinalizationData {
        bytes32[] handles;
        bytes cleartexts;
        bytes decryptionProof;
        bool ready;
    }

    FinalizationData private _pendingFinalization;

    /// @notice Address authorized to post finalization data (off-chain relayer).
    address public relayer;

    /// @notice Owner who can update the relayer address.
    address public owner;

    event DrawStartedByKeeper(uint256 timestamp);
    event DrawFinalizedByKeeper(uint256 timestamp);
    event FinalizationDataPosted(address indexed relayer);

    error OnlyOwner();
    error OnlyRelayer();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    constructor(address pool_, address relayer_) {
        pool = IConfidentialPrizePool(pool_);
        relayer = relayer_;
        owner = msg.sender;
    }

    /// @notice Post decryption data for finalization. Called by the off-chain relayer
    ///         after the Zama KMS decrypts the pool total.
    function postFinalizationData(
        bytes32[] calldata handles,
        bytes calldata cleartexts,
        bytes calldata decryptionProof
    ) external onlyRelayer {
        _pendingFinalization = FinalizationData({
            handles: handles,
            cleartexts: cleartexts,
            decryptionProof: decryptionProof,
            ready: true
        });
        emit FinalizationDataPosted(msg.sender);
    }

    /// @notice Update the authorized relayer address.
    function setRelayer(address relayer_) external onlyOwner {
        relayer = relayer_;
    }

    /// @notice Transfer ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ─────────────────────────────────────────────── Chainlink Automation

    /// @notice Called off-chain by the Chainlink Automation network every block.
    ///         Returns true if the keeper should perform upkeep (start or finalize a draw).
    /// @dev Gas-free simulation — no state changes.
    function checkUpkeep(bytes calldata)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint8 state = pool.drawState();

        if (state == 0) {
            // Idle — check if we can start a new draw
            bool hasParticipants = pool.participantCount() > 0;
            bool intervalPassed = block.timestamp >= pool.lastDrawTime() + pool.drawInterval();
            if (hasParticipants && intervalPassed) {
                return (true, abi.encode(uint8(0))); // action = startDraw
            }
        } else if (state == 1) {
            // AwaitingTotal — check if finalization data is ready
            if (_pendingFinalization.ready) {
                return (true, abi.encode(uint8(1))); // action = finalizeDraw
            }
        }

        return (false, "");
    }

    /// @notice Called on-chain by the Chainlink Automation network when checkUpkeep returns true.
    /// @param performData Encoded action type (0 = startDraw, 1 = finalizeDraw)
    function performUpkeep(bytes calldata performData) external override {
        uint8 action = abi.decode(performData, (uint8));

        if (action == 0) {
            pool.startDraw();
            emit DrawStartedByKeeper(block.timestamp);
        } else if (action == 1) {
            FinalizationData memory data = _pendingFinalization;
            require(data.ready, "No finalization data");
            
            // Clear before external call (reentrancy protection)
            delete _pendingFinalization;
            
            pool.finalizeDraw(data.handles, data.cleartexts, data.decryptionProof);
            emit DrawFinalizedByKeeper(block.timestamp);
        }
    }
}
