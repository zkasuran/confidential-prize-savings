import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Deposited,
  Withdrawn,
  PrizeSponsored,
  DrawStarted,
  DrawFinalized,
} from "../generated/ConfidentialPrizePool/ConfidentialPrizePool";
import {
  Participant,
  DrawRound,
  DepositEvent,
  WithdrawalEvent,
  SponsorEvent,
  PoolStats,
} from "../generated/schema";

function getOrCreateStats(): PoolStats {
  let stats = PoolStats.load("1");
  if (!stats) {
    stats = new PoolStats("1");
    stats.totalRounds = BigInt.zero();
    stats.currentParticipants = BigInt.zero();
    stats.totalDeposits = BigInt.zero();
    stats.totalWithdrawals = BigInt.zero();
    stats.lastRevealedTotal = BigInt.zero();
    stats.lastDrawTimestamp = BigInt.zero();
  }
  return stats;
}

export function handleDeposited(event: Deposited): void {
  const id = event.params.account;

  // Update or create participant
  let participant = Participant.load(id);
  if (!participant) {
    participant = new Participant(id);
    participant.joinedAt = event.block.timestamp;
    participant.depositCount = BigInt.zero();
    participant.withdrawCount = BigInt.zero();
    participant.isActive = true;

    const stats = getOrCreateStats();
    stats.currentParticipants = stats.currentParticipants.plus(BigInt.fromI32(1));
    stats.save();
  }
  participant.depositCount = participant.depositCount.plus(BigInt.fromI32(1));
  participant.save();

  // Create deposit event (no amount — encrypted!)
  const depositEvent = new DepositEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  depositEvent.account = event.params.account;
  depositEvent.blockNumber = event.block.number;
  depositEvent.timestamp = event.block.timestamp;
  depositEvent.transactionHash = event.transaction.hash;
  depositEvent.save();

  // Update global stats
  const stats = getOrCreateStats();
  stats.totalDeposits = stats.totalDeposits.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleWithdrawn(event: Withdrawn): void {
  const id = event.params.account;
  let participant = Participant.load(id);
  if (participant) {
    participant.withdrawCount = participant.withdrawCount.plus(BigInt.fromI32(1));
    participant.save();
  }

  const withdrawEvent = new WithdrawalEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  withdrawEvent.account = event.params.account;
  withdrawEvent.blockNumber = event.block.number;
  withdrawEvent.timestamp = event.block.timestamp;
  withdrawEvent.transactionHash = event.transaction.hash;
  withdrawEvent.save();

  const stats = getOrCreateStats();
  stats.totalWithdrawals = stats.totalWithdrawals.plus(BigInt.fromI32(1));
  stats.save();
}

export function handlePrizeSponsored(event: PrizeSponsored): void {
  const sponsorEvent = new SponsorEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  sponsorEvent.sponsor = event.params.sponsor;
  sponsorEvent.blockNumber = event.block.number;
  sponsorEvent.timestamp = event.block.timestamp;
  sponsorEvent.transactionHash = event.transaction.hash;
  sponsorEvent.save();
}

export function handleDrawStarted(event: DrawStarted): void {
  // Draw started — no action needed, just tracking state
}

export function handleDrawFinalized(event: DrawFinalized): void {
  const roundId = event.params.round.toString();

  const round = new DrawRound(roundId);
  round.blockNumber = event.block.number;
  round.timestamp = event.block.timestamp;
  round.transactionHash = event.transaction.hash;
  round.revealedTotal = event.params.revealedTotal;
  round.participantCount = BigInt.zero(); // would need to read contract state
  round.winnerHidden = true; // ALWAYS true — privacy preserved
  round.save();

  const stats = getOrCreateStats();
  stats.totalRounds = stats.totalRounds.plus(BigInt.fromI32(1));
  stats.lastRevealedTotal = event.params.revealedTotal;
  stats.lastDrawTimestamp = event.block.timestamp;
  stats.save();
}
