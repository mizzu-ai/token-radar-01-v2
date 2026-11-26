# Token Radar 01 — Autonomous DeFi Valuation & Farming Intelligence

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/mizzu-ai/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/mizzu-ai/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for the **make.fun** competition, Token Radar evaluates pre-token DeFi protocols to uncover early farming opportunities and project market-implied launch valuations. Utilizing the `radar-2` model, the system analyzes onchain TVL, 7-day velocity, protocol maturity, and multi-chain breadth derived exclusively from sealed DefiLlama snapshot data without hardcoded protocol biases. Every scored protocol features a concrete, 6-step actionable farm plan specifying capital requirements, execution duration, and chain-specific gas estimations.

## Features

- **radar-2 Quantitative Valuation**: Mathematical valuation model incorporating category-specific market multiples, growth clamping (-50% to +150%), age maturity curves (0.7x–1.3x), and multi-chain expansion premiums (1.0x–1.15x).
- **Comprehensive Coverage**: Evaluates all 40 watchlist protocols and identifies 160 high-signal early pre-token protocols below the $50M floor, ranking 200 protocols in total.
- **Actionable 6-Step Farming Intelligence**: Detailed step-by-step strategies tailored to protocol categories and chain gas characteristics.
- **Zero-Network Static Dashboard**: Pure client-side dashboard with interactive sorting, URL query-param-driven views (`?view=board`, `?view=detail`, `?view=filtered`), deep valuation math inspection, and live-token market comparisons.
