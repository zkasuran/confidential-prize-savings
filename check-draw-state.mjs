import { ethers } from "/home/asuran/Downloads/hackathon-hq/work/zama-pool/frontend/node_modules/ethers/lib.esm/index.js";
const p = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
const POOL = "0x89EE395e44bD7F7401D47805550f9dc424b9D553";
const abi = [
  "function drawState() view returns (uint8)",
  "function drawInterval() view returns (uint256)",
  "function lastDrawTime() view returns (uint256)",
  "function participantCount() view returns (uint256)",
  "function owner() view returns (address)",
  "function currentRound() view returns (uint256)",
];
const c = new ethers.Contract(POOL, abi, p);
const NAMES = ["Idle", "AwaitingTotal"];
for (const f of ["drawState", "drawInterval", "lastDrawTime", "participantCount", "owner", "currentRound"]) {
  try { console.log(`  ${f.padEnd(18)} ${await c[f]()}`); }
  catch (e) { console.log(`  ${f.padEnd(18)} n/a`); }
}
const st = Number(await c.drawState());
const iv = Number(await c.drawInterval());
const lt = Number(await c.lastDrawTime());
const pc = Number(await c.participantCount());
const now = Math.floor(Date.now() / 1000);
const earliest = lt + iv;
console.log(`\n  drawState        ${st} (${NAMES[st] ?? "?"})`);
console.log(`  drawInterval     ${iv}s`);
console.log(`  participants     ${pc}`);
console.log(`  earliest draw    ${earliest === 0 ? "any time" : new Date(earliest * 1000).toISOString()}`);
console.log(`  now              ${new Date(now * 1000).toISOString()}`);
console.log(`\n  startDraw() now: ${pc === 0 ? "REVERTS NoParticipants, deposit first" : now >= earliest ? "ALLOWED" : `REVERTS DrawTooSoon, wait ${earliest - now}s or call setDrawInterval(0) as owner`}`);
