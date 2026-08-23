export default function HowItWorks() {
  return (
    <section className="how-it-works">
      <div className="section-header">
        <span className="section-badge">How It Works</span>
        <h2>Privacy-Preserving Prize Savings</h2>
        <p className="section-subtitle">
          Your money stays encrypted at every step — from deposit to potential win
        </p>
      </div>

      <div className="flow-grid">
        <div className="flow-step">
          <div className="flow-number">01</div>
          <div className="flow-icon">🔐</div>
          <h3>Encrypt & Deposit</h3>
          <p>
            Your deposit amount is encrypted in-browser using the Zama FHE SDK before it ever
            touches the blockchain. The contract only ever sees ciphertext.
          </p>
        </div>

        <div className="flow-connector">
          <svg width="40" height="2" viewBox="0 0 40 2">
            <line x1="0" y1="1" x2="40" y2="1" stroke="url(#grad)" strokeWidth="2" strokeDasharray="4 2" />
            <defs>
              <linearGradient id="grad">
                <stop offset="0%" stopColor="#7c5cff" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="flow-step">
          <div className="flow-number">02</div>
          <div className="flow-icon">🏊</div>
          <h3>Pool Together</h3>
          <p>
            Encrypted deposits accumulate in the pool. Individual balances are private —
            only you can decrypt yours. The pool total stays hidden until draw time.
          </p>
        </div>

        <div className="flow-connector">
          <svg width="40" height="2" viewBox="0 0 40 2">
            <line x1="0" y1="1" x2="40" y2="1" stroke="url(#grad)" strokeWidth="2" strokeDasharray="4 2" />
          </svg>
        </div>

        <div className="flow-step">
          <div className="flow-number">03</div>
          <div className="flow-icon">🎲</div>
          <h3>Fair FHE Draw</h3>
          <p>
            A deposit-weighted random ticket is drawn entirely under encryption using on-chain
            CSPRNG. Larger deposits = higher probability, but nobody sees the weights.
          </p>
        </div>

        <div className="flow-connector">
          <svg width="40" height="2" viewBox="0 0 40 2">
            <line x1="0" y1="1" x2="40" y2="1" stroke="url(#grad)" strokeWidth="2" strokeDasharray="4 2" />
          </svg>
        </div>

        <div className="flow-step">
          <div className="flow-number">04</div>
          <div className="flow-icon">🏆</div>
          <h3>Hidden Winner</h3>
          <p>
            The prize is added to exactly one account's encrypted balance via FHE.select.
            You discover you won by decrypting your own balance — no public announcement.
          </p>
        </div>
      </div>

      <div className="privacy-banner">
        <div className="privacy-icon">🛡️</div>
        <div className="privacy-text">
          <strong>No-Loss Guarantee</strong>
          <p>
            Your principal is always safe and redeemable. Over-withdrawals are mathematically
            clamped to zero under FHE. Winning only adds to your balance — never subtracts from anyone.
          </p>
        </div>
      </div>
    </section>
  );
}
