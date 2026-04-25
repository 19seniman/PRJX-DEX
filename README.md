# 🤖 PRJX + Uniswap Swap Bot

Script Node.js untuk swap token di dua jaringan berbeda:
1. **USDT0 → USDH** di HyperEVM via Project X (PRJX)
2. **USDT → USDC** di Base via Uniswap V3

---

## ⚙️ Instalasi

```bash
npm install ethers dotenv
```

---

## 🔧 Setup

1. Copy file `.env.example` menjadi `.env`
2. Isi `PRIVATE_KEY` dengan private key wallet kamu
3. Sesuaikan jumlah dan slippage

```bash
cp .env.example .env
# Edit .env dan isi PRIVATE_KEY
```

---

## 🚀 Cara Pakai

```bash
# Cek saldo saja (AMAN, tidak ada transaksi)
node swap-bot.js dryrun

# Swap USDT0 → USDH di HyperEVM (Project X)
node swap-bot.js swap1

# Swap USDT → USDC di Base (Uniswap V3)
node swap-bot.js swap2

# Jalankan kedua swap sekaligus
node swap-bot.js all
```

---

## 📋 Contract Addresses

### HyperEVM (Chain ID: 999)
| Token/Contract | Address |
|---|---|
| USDT0 (bridged USDT) | `0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb` |
| USDH (native Hyperliquid) | `0x111111a1a0667d36bd57c0a9f569b98057111111` |
| PRJX Router | `0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B` ✅ |
| RPC | `https://rpc.hyperliquid.xyz/evm` |

### Base (Chain ID: 8453)
| Token/Contract | Address |
|---|---|
| USDT (Stargate) | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |
| USDC (Circle native) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Uniswap V3 Router | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| RPC | `https://mainnet.base.org` |

---

## 🔒 Keamanan

- ❌ Jangan pernah commit `PRIVATE_KEY` ke Git
- ❌ Jangan gunakan wallet utama
- ✅ Gunakan wallet khusus/burner dengan dana terbatas
- ✅ Selalu jalankan `dryrun` terlebih dahulu
- ✅ Verifikasi semua contract address sebelum swap

---

## 💡 Tips

- **Gas HyperEVM**: butuh HYPE (beli di Hyperliquid, transfer ke EVM)
- **Gas Base**: butuh ETH di Base network
- **Slippage stablecoin**: 0.5% (50 bps) sudah aman untuk pair stablecoin
- **Fee Uniswap USDT/USDC Base**: gunakan fee tier 100 (0.01%) untuk pool paling liquid
