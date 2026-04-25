/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 2.0 (LOOPING & STABLE)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- KONFIGURASI ---
const NETWORKS = {
  hyperevm: {
    name: "HyperEVM",
    rpc: "https://rpc.hyperliquid.xyz/evm",
    chainId: 999,
  },
  base: {
    name: "Base",
    rpc: "https://mainnet.base.org",
    chainId: 8453,
  },
};

const HYPEREVM_CONTRACTS = {
  USDT0: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
  USDH: "0x111111a1a0667d36bd57c0a9f569b98057111111",
  PRJX_ROUTER: "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B",
};

const BASE_CONTRACTS = {
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  UNISWAP_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481",
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

const ROUTER_ABI = [
  `function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)`
];

// --- LOGIKA SWAP ---
async function runSwap(networkKey, iteration) {
  const isHyper = networkKey === "hyperevm";
  const config = isHyper ? 
    { 
        net: NETWORKS.hyperevm, 
        tokens: { in: HYPEREVM_CONTRACTS.USDT0, out: HYPEREVM_CONTRACTS.USDH },
        router: HYPEREVM_CONTRACTS.PRJX_ROUTER,
        fee: 100, 
        amountIn: process.env.AMOUNT_USDT0 || "0.01"
    } : 
    { 
        net: NETWORKS.base, 
        tokens: { in: BASE_CONTRACTS.USDT, out: BASE_CONTRACTS.USDC },
        router: BASE_CONTRACTS.UNISWAP_ROUTER,
        fee: 500, // Fee 0.05% lebih stabil untuk Base
        amountIn: process.env.AMOUNT_USDT_BASE || "0.011698"
    };

  console.log(`\n[Transaksi #${iteration}] Memulai Swap di ${config.net.name}...`);
  
  const provider = new ethers.JsonRpcProvider(config.net.rpc);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const walletAddress = await signer.getAddress();

  const tokenInContract = new ethers.Contract(config.tokens.in, ERC20_ABI, signer);
  const router = new ethers.Contract(config.router, ROUTER_ABI, signer);

  const decimalsIn = await tokenInContract.decimals();
  const amountInWei = ethers.parseUnits(config.amountIn, decimalsIn);

  // Slippage 0.5% agar tidak revert
  const slippageBps = 50; 
  const amountOutMinWei = (amountInWei * BigInt(10000 - slippageBps)) / BigInt(10000);

  // Approval (Hanya jika perlu)
  const allowance = await tokenInContract.allowance(walletAddress, config.router);
  if (allowance < amountInWei) {
      console.log(`  📝 Menyetujui token...`);
      const approveTx = await tokenInContract.approve(config.router, ethers.MaxUint256);
      await approveTx.wait();
  }

  const params = {
    tokenIn: config.tokens.in,
    tokenOut: config.tokens.out,
    fee: config.fee,
    recipient: walletAddress,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    amountIn: amountInWei,
    amountOutMinimum: amountOutMinWei,
    sqrtPriceLimitX96: 0,
  };

  try {
    const tx = await router.exactInputSingle(params, { gasLimit: 500000 });
    console.log(`  ⏳ Transaksi dikirim: ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
        console.log(`  ✅ Transaksi #${iteration} BERHASIL!`);
    } else {
        console.log(`  ❌ Transaksi #${iteration} GAGAL di blockchain.`);
    }
  } catch (err) {
    console.error(`  ❌ Error pada Transaksi #${iteration}: ${err.reason || err.message}`);
  }
}

// --- MENU UTAMA ---
async function main() {
  console.clear();
  console.log("==========================================");
  console.log("    🤖 BOT SWAP AUTO-REPEAT (PRJX/BASE)   ");
  console.log("==========================================");

  if (!process.env.PRIVATE_KEY) {
    console.log("❌ ERROR: Set PRIVATE_KEY di file .env!");
    process.exit(1);
  }

  console.log("\nPilih Jaringan:");
  console.log("1. HyperEVM (USDT0 -> USDH)");
  console.log("2. Base (USDT -> USDC)");
  console.log("3. Jalankan Keduanya");
  console.log("0. Keluar");

  const choice = await question("\nMasukkan pilihan (0-3): ");
  if (choice === "0") return rl.close();

  const countStr = await question("Berapa kali transaksi ingin dilakukan? (Contoh: 5): ");
  const count = parseInt(countStr) || 1;

  const pauseStr = await question("Jeda antar transaksi (detik)? (Contoh: 10): ");
  const pause = (parseInt(pauseStr) || 10) * 1000;

  console.log(`\n--- Memulai ${count} transaksi dengan jeda ${pause/1000}s ---\n`);

  for (let i = 1; i <= count; i++) {
    if (choice === "1" || choice === "3") {
      await runSwap("hyperevm", i);
    }
    
    if (choice === "2" || choice === "3") {
      await runSwap("base", i);
    }

    if (i < count) {
      console.log(`\n😴 Menunggu ${pause/1000} detik sebelum transaksi berikutnya...`);
      await sleep(pause);
    }
  }

  console.log("\n✅ Semua tugas selesai!");
  rl.close();
}

main().catch(console.error);
