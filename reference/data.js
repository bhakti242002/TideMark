/* ==========================================================================
   Tidemark demo dataset
   Every address, entity, transaction and price below is fictional. It exists
   to exercise the tracing engine with the patterns investigators actually see:
   a split, a DEX swap, a bridge hop, a peel chain, a mixer, a no-KYC swap to
   another chain, commingling with clean funds, and dormant balances.
   ========================================================================== */
'use strict';

const HOUR = 3600 * 1000;
const T0 = Date.UTC(2026, 10, 9, 3, 12);                  // exploit block time, Nov 9 2026 03:12 UTC
const PRICES = { ETH: 3000, BTC: 60000, USDT: 1, USD: 1 }; // fixed snapshot used for every USD value

const CHAINS = {
  ethereum: { label: 'Ethereum' },
  tron: { label: 'TRON' },
  bitcoin: { label: 'Bitcoin' },
};

const CASE = {
  id: 'TM-2611',
  title: 'Lattice Bridge exploit',
  root: 'expl',      // where tracing starts
  victim: 'vault',
  openedAt: T0 + 1.5 * HOUR,
};

/* Entity and address nodes. Wallets carry one address; entities (services)
   list the addresses observed for them. Cluster nodes summarise the thousands
   of unrelated counterparties a service has, so hubs stay legible. */
const NODES = [
  { id: 'vault', kind: 'victim', label: 'Lattice Bridge vault', chains: ['ethereum'],
    address: '0x3f1e9a7c52b04d8e6a1c0f9b7d23e8a4c5b6d901',
    note: 'Bridge contract holding user deposits. Drained through a signature-verification bug in withdraw().' },
  { id: 'vault_in', kind: 'cluster', label: '6,240 depositors', chains: ['ethereum'], of: 'vault' },
  { id: 'vault_out', kind: 'cluster', label: '3,915 withdrawers', chains: ['ethereum'], of: 'vault' },

  { id: 'expl', kind: 'theft', label: 'Lattice exploiter', chains: ['ethereum'],
    address: '0x7c3ae0b19d4f22a8c6e3157b9f04d8a2e6c13e19',
    note: 'Sent the forged withdraw() calls and received the 1,820 ETH.' },
  { id: 'w1', kind: 'wallet', chains: ['ethereum'], address: '0xa41d07e3b8c95f2e1d6a4b0c73e9f81a25d4c6b2', tags: ['Exploiter-linked'] },
  { id: 'w2', kind: 'wallet', chains: ['ethereum'], address: '0x5e9c2b7a13f08d4e6c1a9b3f72d5e80c4a1b9f37', tags: ['Exploiter-linked'] },
  { id: 'w3', kind: 'wallet', chains: ['ethereum'], address: '0xd27f4a9e0c63b18d5e2f7a41c9b06e3d8f15a2c4', tags: ['Exploiter-linked'] },
  { id: 'w4', kind: 'wallet', chains: ['ethereum'], address: '0x91b6e2d4a7c08f3b5e1d9a62c4f70b8e3d2a5c16' },

  { id: 'kestrel', kind: 'mixer', label: 'Kestrel Mixer', chains: ['ethereum'],
    address: '0x9d3f6a1e8b2c47d05e9a3c1f6b8d2e4a7c0f5b13',
    note: 'Fixed-denomination ETH mixer. Deposits and withdrawals can’t be linked on-chain, so tracing stops here.' },
  { id: 'kestrel_in', kind: 'cluster', label: '2,914 depositors', chains: ['ethereum'], of: 'kestrel' },
  { id: 'kestrel_out', kind: 'cluster', label: '3,106 withdrawers', chains: ['ethereum'], of: 'kestrel' },

  { id: 'meridian', kind: 'dex', label: 'Meridian Swap', chains: ['ethereum'],
    address: '0x1b7e4c9a2d6f08e35a1c7b9d4e2f6a8c0d3b5e71',
    note: 'DEX aggregator router. Swaps are decoded, so each output is linked to the input that paid for it.' },
  { id: 'meridian_in', kind: 'cluster', label: '48,210 traders', chains: ['ethereum'], of: 'meridian' },
  { id: 'meridian_out', kind: 'cluster', label: '47,930 recipients', chains: ['ethereum'], of: 'meridian' },

  { id: 'arclight', kind: 'bridge', label: 'Arclight Bridge', chains: ['ethereum', 'tron'],
    addresses: [
      { chain: 'ethereum', address: '0x6c2a9e4b1f7d35c08a6e2b4d9f1c7a3e5b0d8f24', role: 'Deposit contract' },
      { chain: 'tron', address: 'TArc7Kq2Wn9Hx4Ls8Vb3Zm6Yc1Dp5Ef2Gj', role: 'Release contract' },
    ],
    note: 'Lock-and-release bridge between Ethereum and TRON. Each TRON release is matched to its Ethereum deposit.' },
  { id: 'arclight_in', kind: 'cluster', label: '21,480 bridge users', chains: ['ethereum'], of: 'arclight' },
  { id: 'arclight_out', kind: 'cluster', label: '21,170 recipients', chains: ['tron'], of: 'arclight' },

  { id: 'quickhop', kind: 'nokyc', label: 'Quickhop', chains: ['ethereum', 'bitcoin'],
    addresses: [
      { chain: 'ethereum', address: '0x4f8b2d6e9a1c35f07b4e8d2a6c9f1e3b5d7a0c48', role: 'Order deposit' },
      { chain: 'bitcoin', address: 'bc1qq7hk2vx9dz4wn8ts3fc6me0yu5ga2lr7jp3k8n', role: 'Payout hot wallet' },
    ],
    note: 'Instant swap service with no identity checks. Its order IDs link each ETH deposit to a BTC payout.' },
  { id: 'quickhop_in', kind: 'cluster', label: '5,612 customers', chains: ['ethereum'], of: 'quickhop' },
  { id: 'quickhop_out', kind: 'cluster', label: '5,540 recipients', chains: ['bitcoin'], of: 'quickhop' },

  { id: 't1', kind: 'wallet', chains: ['tron'], address: 'TQx7Lp2VbN9mK4sR8dF3hW6yC1aZ5eJtUo', tags: ['Peel chain'] },
  { id: 't2', kind: 'wallet', chains: ['tron'], address: 'TNc3uYw8Gh5RkP1zXm7Dq4Vb9sE2fLaJ6t', tags: ['Peel chain'] },
  { id: 't3', kind: 'wallet', chains: ['tron'], address: 'TFr9eB2kWq6Hn3Ys8ZcM5vX1dGp7Tj4UaR', tags: ['Peel chain', 'Commingled'] },
  { id: 't4', kind: 'wallet', chains: ['tron'], address: 'TGk2Vn8Qw5Ec3Rz9Hb6Ys1Xm4Da7Pf2JtL' },
  { id: 'u2', kind: 'wallet', chains: ['tron'], address: 'TWm5Zx3Kc8Nq1Bv7Rd4Hs9Yf2Ge6Lp3UaT',
    note: 'Funded by a Northwind withdrawal four days before the exploit, then emptied into {t3}.' },

  { id: 'northwind', kind: 'exchange', label: 'Northwind Exchange', chains: ['tron', 'bitcoin'],
    addresses: [
      { chain: 'tron', address: 'TJp4Rw9Xk2Ve7Nc5Hq8Zm3Ys6Ba1Df4GuL', role: 'Customer deposit A' },
      { chain: 'tron', address: 'TKe8Hx2Qn5Wr9Lb3Zc7Vm1Ys4Dp6Ga2UjF', role: 'Customer deposit B' },
      { chain: 'bitcoin', address: 'bc1qn7wq3kf5x9dz2ehv8ms6tc4yu0ga3lj7rp5k2e', role: 'Customer deposit C' },
      { chain: 'tron', address: 'TRf6Hk1Wb8Zq3Nx5Vc9Ld2Ym7Ps4Ga6JtE', role: 'Withdrawal hot wallet' },
    ],
    note: 'Regulated exchange with KYC and a law-enforcement response team. Responds to freeze requests.' },
  { id: 'northwind_in', kind: 'cluster', label: '18,402 depositors', chains: ['tron', 'bitcoin'], of: 'northwind' },
  { id: 'northwind_out', kind: 'cluster', label: '17,955 withdrawers', chains: ['tron', 'bitcoin'], of: 'northwind' },

  { id: 'halcyon', kind: 'otc', label: 'Halcyon OTC', chains: ['tron'],
    addresses: [{ chain: 'tron', address: 'THq3Ns7Wd2Kx9Bv5Rf8Lc4Ym6Zp1Ea3JgT', role: 'Client settlement' }],
    note: 'Licensed OTC desk settling large USDT trades. Performs KYC on clients.' },
  { id: 'halcyon_in', kind: 'cluster', label: '212 clients', chains: ['tron'], of: 'halcyon' },
  { id: 'halcyon_out', kind: 'cluster', label: '198 payees', chains: ['tron'], of: 'halcyon' },

  { id: 'c1', kind: 'wallet', chains: ['bitcoin'], address: 'bc1q7x9hd3ke2wq4tnr8vz5mx0ls6cy2pf3ga8jn4u' },
  { id: 'c2', kind: 'wallet', chains: ['bitcoin'], address: 'bc1qm4ze8u0sx3gkq7w2hd5ctj9vfn6py8ar3la7ke' },
  { id: 'c3', kind: 'wallet', chains: ['bitcoin'], address: 'bc1qh8n2xw5ey3fd7kqv0tz9cs4mj6la2pg8ur5n3d', tags: ['Commingled'] },
  { id: 'c4', kind: 'wallet', chains: ['bitcoin'], address: 'bc1qa5vk3ry9xh2t7wnq8ef0dz6cs4gmu3lp9j2k7x' },
  { id: 'u1', kind: 'wallet', chains: ['bitcoin'], address: 'bc1qz3m8pk6dw2ys9fx4tqh7ve0nc5ra3gl8uj6e2w',
    opening: { asset: 'BTC', amount: 6.3 },
    note: 'Long-lived wallet with no prior link to the case. Sent 6 BTC into {c3} an hour after stolen BTC arrived.' },

  { id: 'garnet', kind: 'sanctions', label: 'Garnet Exchange', chains: ['bitcoin'],
    addresses: [{ chain: 'bitcoin', address: 'bc1qd6tw9kz3hr5x2nq7cf8vm0es4ja3ug5lp9y6kx', role: 'Customer deposit' }],
    note: 'Exchange designated by a sanctions authority. Will not honour freeze requests; exposure must be reported.' },
  { id: 'garnet_in', kind: 'cluster', label: '1,180 depositors', chains: ['bitcoin'], of: 'garnet' },
  { id: 'garnet_out', kind: 'cluster', label: '1,042 withdrawers', chains: ['bitcoin'], of: 'garnet' },
];

/* Transfers. `h` is hours relative to the exploit. `link` ties a service's
   output leg to the input leg that paid for it (decoded swap, bridge or order). */
const tx = (id, from, to, chain, asset, amount, h, extra = {}) =>
  ({ id, from, to, chain, asset, amount, ts: T0 + h * HOUR, ...extra });

const TRANSFERS = [
  // Background volume for every service (aggregated; `n` is the transaction count).
  tx('h01', 'vault_in', 'vault', 'ethereum', 'ETH', 16200, -720, { n: 9412 }),
  tx('h02', 'vault', 'vault_out', 'ethereum', 'ETH', 9800, -360, { n: 5120 }),
  tx('h03', 'kestrel_in', 'kestrel', 'ethereum', 'ETH', 71400, -240, { n: 8812 }),
  tx('h04', 'kestrel', 'kestrel_out', 'ethereum', 'ETH', 70950, -120, { n: 9104 }),
  tx('h05', 'meridian_in', 'meridian', 'ethereum', 'USD', 1.24e9, -200, { n: 1830412 }),
  tx('h06', 'meridian', 'meridian_out', 'ethereum', 'USD', 1.238e9, -199, { n: 1829977 }),
  tx('h07', 'arclight_in', 'arclight', 'ethereum', 'USD', 8.6e8, -210, { n: 64210 }),
  tx('h08', 'arclight', 'arclight_out', 'tron', 'USD', 8.58e8, -209, { n: 63980 }),
  tx('h09', 'quickhop_in', 'quickhop', 'ethereum', 'USD', 9.6e7, -230, { n: 11845 }),
  tx('h10', 'quickhop', 'quickhop_out', 'bitcoin', 'USD', 9.5e7, -229, { n: 11790 }),
  tx('h11', 'northwind_in', 'northwind', 'tron', 'USD', 1.9e9, -250, { n: 402118 }),
  tx('h12', 'northwind', 'northwind_out', 'tron', 'USD', 1.87e9, -249, { n: 388406 }),
  tx('h13', 'halcyon_in', 'halcyon', 'tron', 'USD', 5.4e7, -260, { n: 1904 }),
  tx('h14', 'halcyon', 'halcyon_out', 'tron', 'USD', 5.34e7, -259, { n: 1877 }),
  tx('h15', 'garnet_in', 'garnet', 'bitcoin', 'USD', 2.12e8, -270, { n: 25112 }),
  tx('h16', 'garnet', 'garnet_out', 'bitcoin', 'USD', 2.09e8, -269, { n: 24830 }),

  // Before the exploit
  tx('p01', 'northwind', 'u2', 'tron', 'USDT', 400000, -96, { fromAddr: 'TRf6Hk1Wb8Zq3Nx5Vc9Ld2Ym7Ps4Ga6JtE' }),
  tx('p02', 'u2', 't3', 'tron', 'USDT', 400000, -72),
  tx('p03', 'kestrel', 'expl', 'ethereum', 'ETH', 0.5, -26, { note: 'Gas money for the attack' }),

  // The exploit
  tx('x01', 'vault', 'expl', 'ethereum', 'ETH', 1820, 0, { theft: true }),
  tx('x02', 'expl', 'w1', 'ethereum', 'ETH', 600, 0.4),
  tx('x03', 'expl', 'w2', 'ethereum', 'ETH', 600, 0.6),
  tx('x04', 'expl', 'w3', 'ethereum', 'ETH', 620, 0.9),

  // Branch A: swap to USDT, bridge to TRON, peel into exchanges
  tx('a01', 'w1', 'meridian', 'ethereum', 'ETH', 600, 2.1, { toAddr: '0x1b7e4c9a2d6f08e35a1c7b9d4e2f6a8c0d3b5e71' }),
  tx('a02', 'meridian', 'w4', 'ethereum', 'USDT', 1796400, 2.1 + 12 / 3600, { link: 'a01' }),
  tx('a03', 'w4', 'arclight', 'ethereum', 'USDT', 1796400, 3.0, { toAddr: '0x6c2a9e4b1f7d35c08a6e2b4d9f1c7a3e5b0d8f24' }),
  tx('a04', 'arclight', 't1', 'tron', 'USDT', 1795500, 3.2, { link: 'a03', fromAddr: 'TArc7Kq2Wn9Hx4Ls8Vb3Zm6Yc1Dp5Ef2Gj' }),
  tx('a05', 't1', 'northwind', 'tron', 'USDT', 240000, 9, { toAddr: 'TJp4Rw9Xk2Ve7Nc5Hq8Zm3Ys6Ba1Df4GuL' }),
  tx('a06', 't1', 't2', 'tron', 'USDT', 1555500, 9.1),
  tx('a07', 't2', 'halcyon', 'tron', 'USDT', 300000, 20, { toAddr: 'THq3Ns7Wd2Kx9Bv5Rf8Lc4Ym6Zp1Ea3JgT' }),
  tx('a08', 't2', 't3', 'tron', 'USDT', 1255500, 20.2),
  tx('a09', 't3', 'northwind', 'tron', 'USDT', 450000, 31, { toAddr: 'TKe8Hx2Qn5Wr9Lb3Zc7Vm1Ys4Dp6Ga2UjF' }),
  tx('a10', 't3', 'halcyon', 'tron', 'USDT', 350000, 40, { toAddr: 'THq3Ns7Wd2Kx9Bv5Rf8Lc4Ym6Zp1Ea3JgT' }),
  tx('a11', 't3', 't4', 'tron', 'USDT', 700000, 44),

  // Branch B: six 100 ETH deposits into the mixer
  ...[5, 5.5, 6, 7, 8, 9].map((h, i) =>
    tx('b0' + (i + 1), 'w2', 'kestrel', 'ethereum', 'ETH', 100, h, { toAddr: '0x9d3f6a1e8b2c47d05e9a3c1f6b8d2e4a7c0f5b13' })),

  // Branch C: no-KYC swap to Bitcoin, split, one leg to a sanctioned exchange
  tx('c01', 'w3', 'quickhop', 'ethereum', 'ETH', 620, 12, { toAddr: '0x4f8b2d6e9a1c35f07b4e8d2a6c9f1e3b5d7a0c48' }),
  tx('c02', 'quickhop', 'c1', 'bitcoin', 'BTC', 30.85, 12.6, { link: 'c01', fromAddr: 'bc1qq7hk2vx9dz4wn8ts3fc6me0yu5ga2lr7jp3k8n' }),
  tx('c03', 'c1', 'c2', 'bitcoin', 'BTC', 12.4, 30),
  tx('c04', 'c1', 'c3', 'bitcoin', 'BTC', 18.45, 30.1),
  tx('c05', 'u1', 'c3', 'bitcoin', 'BTC', 6.0, 31),
  tx('c06', 'c2', 'garnet', 'bitcoin', 'BTC', 12.4, 33, { toAddr: 'bc1qd6tw9kz3hr5x2nq7cf8vm0es4ja3ug5lp9y6kx' }),
  tx('c07', 'c3', 'northwind', 'bitcoin', 'BTC', 9.0, 52, { toAddr: 'bc1qn7wq3kf5x9dz2ehv8ms6tc4yu0ga3lj7rp5k2e' }),
  tx('c08', 'c3', 'c4', 'bitcoin', 'BTC', 13.0, 60),
];

/* Investigative leads: written by the analyst, linked to the graph. */
const LEADS = [
  { id: 'gas', title: 'The gas money came from Kestrel Mixer',
    body: 'The exploiter’s only funding before the attack was a 0.5 ETH Kestrel withdrawal 26 hours earlier. The attack was staged, and the withdrawal’s timing can narrow down which deposit funded it.',
    select: 'expl', reveal: [] },
  { id: 'commingle', title: 'Clean funds were mixed in on TRON',
    body: '{t3} already held 400K USDT when stolen funds arrived. That money came from {u2}, which Northwind funded with a withdrawal on Nov 5. Northwind can identify the customer behind it.',
    select: 'u2', reveal: ['u2'] },
  { id: 'peel', title: 'A peel chain fed two cash-out desks',
    body: 'Three TRON wallets peeled off 240K to 450K USDT at a time into Northwind and Halcyon, roughly every 11 hours. The receiving deposit addresses likely belong to cash-out accounts.',
    select: 't1', reveal: [] },
  { id: 'sanctioned', title: '12.4 BTC reached a sanctioned exchange',
    body: 'Garnet Exchange won’t act on a freeze request. Report the exposure to the sanctions authority instead, and flag the sending address for screening.',
    select: 'garnet', reveal: [] },
];
