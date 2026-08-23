import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import * as hre from "hardhat";
import { expect } from "chai";
import { ConfidentialToken, ConfidentialPrizePool } from "../types";

const YEAR = 365 * 24 * 3600;

describe("ConfidentialPrizePool", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let token: ConfidentialToken;
  let pool: ConfidentialPrizePool;
  let tokenAddr: string;
  let poolAddr: string;

  before(async function () {
    if (!hre.fhevm.isMock) {
      // FHE user/public decryption helpers only work against the mock coprocessor.
      console.warn("This suite must run on the FHEVM mock (hardhat network).");
      this.skip();
    }
    [deployer, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async function () {
    const Token = await ethers.getContractFactory("ConfidentialToken");
    token = (await Token.deploy("Confidential USD", "cUSD", "uri")) as ConfidentialToken;
    tokenAddr = await token.getAddress();

    const Pool = await ethers.getContractFactory("ConfidentialPrizePool");
    pool = (await Pool.deploy(tokenAddr, 0)) as ConfidentialPrizePool;
    poolAddr = await pool.getAddress();
  });

  // ------------------------------------------------------------------ helpers

  async function enc64(target: string, user: string, value: bigint) {
    return fhevm.createEncryptedInput(target, user).add64(value).encrypt();
  }

  async function fund(signer: HardhatEthersSigner, amount: bigint) {
    await (await token.connect(signer).mint(signer.address, amount)).wait();
    const until = Math.floor(Date.now() / 1000) + YEAR;
    await (await token.connect(signer).setOperator(poolAddr, until)).wait();
  }

  async function deposit(signer: HardhatEthersSigner, amount: bigint) {
    const e = await enc64(poolAddr, signer.address, amount);
    await (await pool.connect(signer).deposit(e.handles[0], e.inputProof)).wait();
  }

  async function withdraw(signer: HardhatEthersSigner, amount: bigint) {
    const e = await enc64(poolAddr, signer.address, amount);
    await (await pool.connect(signer).withdraw(e.handles[0], e.inputProof)).wait();
  }

  async function sponsor(signer: HardhatEthersSigner, amount: bigint) {
    const e = await enc64(poolAddr, signer.address, amount);
    await (await pool.connect(signer).sponsorPrize(e.handles[0], e.inputProof)).wait();
  }

  async function poolBalance(signer: HardhatEthersSigner): Promise<bigint> {
    const h = await pool.confidentialBalanceOf(signer.address);
    if (h === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, h, poolAddr, signer);
  }

  async function tokenBalance(signer: HardhatEthersSigner): Promise<bigint> {
    const h = await token.confidentialBalanceOf(signer.address);
    if (h === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, h, tokenAddr, signer);
  }

  async function runDraw() {
    await (await pool.startDraw()).wait();
    const handle = await pool.totalDepositedHandle();
    const dec = await fhevm.publicDecrypt([handle]);
    await (await pool.finalizeDraw([handle], dec.abiEncodedClearValues, dec.decryptionProof)).wait();
  }

  it("faucet mints an encrypted token balance the holder can decrypt", async function () {
    await (await token.connect(alice).mint(alice.address, 100_000000n)).wait();
    expect(await tokenBalance(alice)).to.eq(100_000000n);
  });

  it("deposit moves encrypted funds into the pool and tracks the participant", async function () {
    await fund(alice, 100_000000n);
    await deposit(alice, 100_000000n);

    expect(await poolBalance(alice)).to.eq(100_000000n);
    expect(await tokenBalance(alice)).to.eq(0n); // funds now held by the pool
    expect(await pool.participantCount()).to.eq(1n);
    expect(await pool.isParticipant(alice.address)).to.eq(true);
  });

  it("withdraw is no-loss and clamps an over-withdrawal to zero", async function () {
    await fund(alice, 100_000000n);
    await deposit(alice, 100_000000n);

    await withdraw(alice, 30_000000n);
    expect(await poolBalance(alice)).to.eq(70_000000n);
    expect(await tokenBalance(alice)).to.eq(30_000000n);

    // Asking for more than the balance must withdraw nothing (principal is protected).
    await withdraw(alice, 1_000_000000n);
    expect(await poolBalance(alice)).to.eq(70_000000n);
    expect(await tokenBalance(alice)).to.eq(30_000000n);
  });

  it("a sole depositor wins the whole sponsored prize (deterministic)", async function () {
    await fund(alice, 100_000000n);
    await deposit(alice, 100_000000n);
    await fund(deployer, 50_000000n);
    await sponsor(deployer, 50_000000n);

    await runDraw();

    // Only range [0,100) exists, so alice always wins the 50 prize on top of her 100.
    expect(await poolBalance(alice)).to.eq(150_000000n);
    expect(await pool.currentRound()).to.eq(1n);
    expect(await pool.lastRevealedTotal()).to.eq(100_000000n);
    expect(await pool.drawState()).to.eq(0n);
  });

  it("awards the prize to exactly one of several depositors, keeping the winner hidden", async function () {
    await fund(alice, 100_000000n);
    await deposit(alice, 100_000000n);
    await fund(bob, 200_000000n);
    await deposit(bob, 200_000000n);
    await fund(deployer, 60_000000n);
    await sponsor(deployer, 60_000000n);

    await runDraw();

    const a = await poolBalance(alice);
    const b = await poolBalance(bob);
    // Exactly one balance grew by the full prize; the other is untouched. No on-chain
    // signal says which, so the winner is only knowable by decrypting one's own balance.
    const outcomes = [
      [160_000000n, 200_000000n],
      [100_000000n, 260_000000n],
    ];
    expect(outcomes).to.deep.include([a, b]);
    expect(a + b).to.eq(360_000000n); // 300 principal + 60 prize, conserved
    expect(await pool.lastRevealedTotal()).to.eq(300_000000n);
  });

  it("locks deposits while a draw is pending and reopens after cancel", async function () {
    await fund(alice, 101_000000n);
    await deposit(alice, 100_000000n);

    await (await pool.startDraw()).wait();
    const e = await enc64(poolAddr, alice.address, 1_000000n);
    await expect(pool.connect(alice).deposit(e.handles[0], e.inputProof)).to.be.revertedWithCustomError(
      pool,
      "DrawInProgress",
    );

    await (await pool.cancelDraw()).wait();
    expect(await pool.drawState()).to.eq(0n);
    await deposit(alice, 1_000000n); // works again (alice still holds 1 cUSD to deposit)
    expect(await poolBalance(alice)).to.eq(101_000000n);
  });

  it("reverts a draw with no participants and a finalize with no draw", async function () {
    await expect(pool.startDraw()).to.be.revertedWithCustomError(pool, "NoParticipants");
    await expect(pool.finalizeDraw([ethers.ZeroHash], "0x", "0x")).to.be.revertedWithCustomError(
      pool,
      "NoDrawInProgress",
    );
  });
});
