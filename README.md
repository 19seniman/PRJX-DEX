# 🤖 PRJX DEX

Website:https://www.prjx.com/@LimMaushin
---

## ⚙️ Instalasi

```bash
git clone https://github.com/19seniman/PRJX-DEX.git
cd PRJX-DEX
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

