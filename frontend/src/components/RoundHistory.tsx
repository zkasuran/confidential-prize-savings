import { useCallback, useEffect, useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { POOL_ADDRESS, POOL_ABI_EXTENDED, CHAIN_RPC } from "../config";

interface RoundData {
  round: number;
  revealedTotal: string;
  timestamp: number;
}

export default function RoundHistory() {
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const provider = new JsonRpcProvider(CHAIN_RPC);
      const pool = new Contract(POOL_ADDRESS, POOL_ABI_EXTENDED, provider);
      
      const currentRound = Number(await pool.currentRound());
      const history: RoundData[] = [];

      // Fetch recent draw events via the public state
      if (currentRound > 0) {
        const filter = pool.filters.DrawFinalized();
        const events = await pool.queryFilter(filter, -100000);
        
        for (const event of events.slice(-10)) { // last 10 rounds
          const block = await event.getBlock();
          const decoded = pool.interface.parseLog({
            topics: event.topics as string[],
            data: event.data,
          });
          if (decoded) {
            history.push({
              round: Number(decoded.args[0]),
              revealedTotal: (Number(decoded.args[1]) / 1e6).toFixed(2),
              timestamp: block?.timestamp ?? 0,
            });
          }
        }
      }

      setRounds(history.reverse());
    } catch (e) {
      console.warn("Failed to fetch round history:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (loading) {
    return (
      <div className="history-section">
        <h2 className="card-title">📊 Round History</h2>
        <div className="skeleton-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="history-section">
        <h2 className="card-title">📊 Round History</h2>
        <div className="history-empty">
          <span className="history-empty-icon">🎲</span>
          <p>No draws completed yet. Be the first to trigger one!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-section">
      <h2 className="card-title">📊 Round History</h2>
      <p className="card-description">
        Past draw results. Only the aggregate TVL is public — individual winners remain encrypted.
      </p>
      <div className="history-table">
        <div className="history-header">
          <span>Round</span>
          <span>Pool TVL</span>
          <span>Winner</span>
          <span>Date</span>
        </div>
        {rounds.map((r) => (
          <div key={r.round} className="history-row">
            <span className="history-round">#{r.round}</span>
            <span className="history-tvl">{r.revealedTotal} cUSD</span>
            <span className="history-winner">
              <span className="encrypted-pill">🔒 Hidden</span>
            </span>
            <span className="history-date">
              {r.timestamp ? new Date(r.timestamp * 1000).toLocaleDateString() : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
