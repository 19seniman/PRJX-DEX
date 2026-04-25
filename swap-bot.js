/**
 * ============================================================
 * PRJX / DEX Swap Bot - Node.js (FIXED & INTERACTIVE)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

// Interface untuk input terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// ─────────────────────────────────────────────
//  KONFIGURASI JARINGAN
// ─────────────────────────────────────────────
const NETWORKS = {
  hyperevm: {
    name: "HyperEVM (Hyperliquid)",
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
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

// ABI Router (Uniswap V3 Compatible)
const ROUTER_ABI = [
  `function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)`
];

// ─────────────────────────────────────────────
//  HELPER FUNCTIONS
// ─────────────────────────────────────────────

async function ensureApproval(tokenContract, spender, amount, signer) {
  const owner = await signer.getAddress();
  const allowance = await tokenContract.allowance(owner, spender);
  if (allowance < amount) {
    console.log(`  📝 Menyetujui token...`);
    const tx = await tokenContract.approve(spender, ethers.MaxUint256);
    await tx.wait();
    console.log(`  ✅ Approve berhasil!`);
  }
}

// ─────────────────────────────────────────────
//  FUNGSI SWAP
// ─────────────────────────────────────────────

async function runSwap(networkKey) {
  const config = networkKey === "hyperevm" ? 
    { 
        net: NETWORKS.hyperevm, 
        tokens: { in: HYPEREVM_CONTRACTS.USDT0, out: HYPEREVM_CONTRACTS.USDH },
        router: HYPEREVM_CONTRACTS.PRJX_ROUTER,
        fee: 100, // Mencoba 0.01% jika 0 gagal
        minOut: process.env.AMOUNT_USDT0 || "0.01",
        amountIn: process.env.AMOUNT_USDT0 || "0.01"
    } : 
    { 
        net: NETWORKS.base, 
        tokens: { in: BASE_CONTRACTS.USDT, out: BASE_CONTRACTS.USDC },
        router: BASE_CONTRACTS.UNISWAP_ROUTER,
        fee: 100, 
        minOut: process.env.AMOUNT_USDT_BASE || "0.011698",
        amountIn: process.env.AMOUNT_USDT_BASE || "0.011698"
    };

  console.log(`\n🚀 Memulai Swap di ${config.net.name}...`);
  
  const provider = new ethers.JsonRpcProvider(config.net.rpc);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const walletAddress = await signer.getAddress();

  const tokenInContract = new ethers.Contract(config.tokens.in, ERC20_ABI, signer);
  const router = new ethers.Contract(config.router, ROUTER_ABI, signer);

  const decimals = await tokenInContract.decimals();
  const amountInWei = ethers.parseUnits(config.amountIn, decimals);
  const amountOutMinWei = ethers.parseUnits(config.minOut, decimals);

  await ensureApproval(tokenInContract, config.router, amountInWei, signer);

  const params = {
    tokenIn: config.tokens.in,
    tokenOut: config.tokens.out,
    fee: config.fee,
    recipient: walletAddress,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    amountIn: amountInWei,
    amountOutMinimum: amountOutMinWei,
    sqrtPriceLimitX96: 0,
  };

  try {
    // Tambahkan gasLimit manual untuk menghindari error estimateGas
    const tx = await router.exactInputSingle(params, {
        gasLimit: 300000 
    });
    console.log(`  ⏳ Transaksi dikirim: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Swap Berhasil!`);
  } catch (err) {
    console.error(`  ❌ Error: ${err.reason || err.message}`);
    console.log("  Tips: Pastikan saldo gas (HYPE/ETH) cukup dan slippage tidak terlalu rendah.");
  }
}

// ─────────────────────────────────────────────
//  MENU UTAMA INTERAKTIF
// ─────────────────────────────────────────────

async function main() {
  console.clear();
  console.log("==========================================");
  console.log("       PRJX & UNISWAP MULTI-CHAIN BOT     ");
  console.log("==========================================");

  if (!process.env.PRIVATE_KEY) {
    console.log("❌ Error: PRIVATE_KEY tidak ditemukan di .env");
    process.exit(1);
  }

  console.log("\nPilih jaringan untuk swap:");
  console.log("1. HyperEVM (USDT0 -> USDH)");
  console.log("2. Base (USDT -> USDC)");
  console.log("3. Keduanya (Berurutan)");
  console.log("0. Keluar");

  const choice = await question("\nMasukkan pilihan (0-3): ");

  switch (choice) {
    case "1":
      await runSwap("hyperevm");
      break;
    case "2":
      await runSwap("base");
      break;
    case "3":
      await runSwap("hyperevm");
      await runSwap("base");
      break;
    case "0":
      console.log("Sampai jumpa!");
      break;
    default:
      console.log("Pilihan tidak valid.");
      break;
  }
  
  rl.close();
}

main().catch(console.error);
