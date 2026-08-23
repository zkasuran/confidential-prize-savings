export default function FeatureCards() {
  const features = [
    {
      icon: "🔐",
      title: "FHE Encrypted",
      description: "Deposits encrypted in-browser using Zama's WASM engine before touching the chain",
      gradient: "gradient-purple",
    },
    {
      icon: "🎲",
      title: "Fair Random",
      description: "On-chain CSPRNG generates deposit-weighted tickets under FHE — unbiasable",
      gradient: "gradient-cyan",
    },
    {
      icon: "🛡️",
      title: "No-Loss",
      description: "Principal always redeemable. Over-withdrawals are clamped to zero under FHE",
      gradient: "gradient-green",
    },
    {
      icon: "🕵️",
      title: "Hidden Winner",
      description: "Winner credited via FHE.select — discoverable only by decrypting your own balance",
      gradient: "gradient-pink",
    },
    {
      icon: "⚡",
      title: "ERC-7984",
      description: "Built on the confidential token standard with full operator approval flows",
      gradient: "gradient-amber",
    },
    {
      icon: "🤖",
      title: "Auto Draws",
      description: "Chainlink Automation keeper triggers draws on schedule — fully autonomous",
      gradient: "gradient-blue",
    },
  ];

  return (
    <section className="features-section">
      <div className="section-header">
        <span className="section-badge">Features</span>
        <h2>Privacy-First DeFi Primitive</h2>
        <p className="section-subtitle">
          Every operation happens under Fully Homomorphic Encryption
        </p>
      </div>
      <div className="features-grid">
        {features.map((f, i) => (
          <div key={i} className={`feature-card ${f.gradient}`}>
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
