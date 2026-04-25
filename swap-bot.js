/**
 * ============================================================
 *  PRJX / DEX Swap Bot - Node.js
 *  Swap 1: USDT0 → USDH  (HyperEVM, Project X DEX)
 *  Swap 2: USDT  → USDC  (Base,     Uniswap v3)
 * ============================================================
 *
 *  INSTALASI:
 *    npm install ethers dotenv
 *
 *  SETUP .env:
 *    PRIVATE_KEY=0xYOUR_PRIVATE_KEY
 *    AMOUNT_USDT0=10        # jumlah USDT0 yang ingin di-swap ke USDH (HyperEVM)
 *    AMOUNT_USDT_BASE=10    # jumlah USDT yang ingin di-swap ke USDC (Base)
 *    SLIPPAGE_BPS=50        # slippage dalam basis poin (50 = 0.5%)
 *
 *  PERINGATAN:
 *    - Gunakan private key dari wallet test/burner saja!
 *    - Pastikan wallet memiliki cukup HYPE (gas HyperEVM) dan ETH (gas Base)
 *    - Verifikasi selalu contract address sebelum run di mainnet
 *    - Script ini hanya untuk tujuan edukasi
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");

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

// ─────────────────────────────────────────────
//  CONTRACT ADDRESSES - HyperEVM
//  (Verifikasi di: https://hyperevmscan.io)
// ─────────────────────────────────────────────
const HYPEREVM_CONTRACTS = {
  // USDT0 = bridged USDT dari layer lain, largest stablecoin di HyperEVM
  USDT0: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",

  // USDH = native stablecoin Hyperliquid oleh Native Markets
  USDH: "0x111111a1a0667d36bd57c0a9f569b98057111111",

  // Project X (PRJX) - SwapRouter (dikonfirmasi dari transaksi live)
  PRJX_ROUTER: "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B",

  // Pool USDT0/USDH di Project X
  // ⚠️  Cek pool aktual di: https://www.prjx.com/liquidity
  POOL_USDT0_USDH: "0x0000000000000000000000000000000000000000", // PLACEHOLDER (opsional)
};

// ─────────────────────────────────────────────
//  CONTRACT ADDRESSES - Base
//  (Sumber resmi: https://docs.uniswap.org/contracts/v3/reference/deployments)
// ─────────────────────────────────────────────
const BASE_CONTRACTS = {
  // USDT bridged di Base (Stargate USDT)
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",

  // USDC native di Base (Circle USDC)
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

  // Uniswap V3 SwapRouter02 di Base (address resmi Uniswap)
  UNISWAP_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481",
};

// ─────────────────────────────────────────────
//  ABI MINIMAL
// ─────────────────────────────────────────────

// ERC-20 standar
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

// Uniswap V3 SwapRouter02 - exactInputSingle
const UNISWAP_V3_ROUTER_ABI = [
  `function exactInputSingle(
    (
      address tokenIn,
      address tokenOut,
      uint24 fee,
      address recipient,
      uint256 amountIn,
      uint256 amountOutMinimum,
      uint160 sqrtPriceLimitX96
    ) params
  ) external payable returns (uint256 amountOut)`,
];

// Project X / UniswapV3-compatible Router ABI
// (sama seperti Uniswap V3 SwapRouter, karena PRJX fork kompatibel)
const PRJX_ROUTER_ABI = [
  `function exactInputSingle(
    (
      address tokenIn,
      address tokenOut,
      uint24 fee,
      address recipient,
      uint256 deadline,
      uint256 amountIn,
      uint256 amountOutMinimum,
      uint160 sqrtPriceLimitX96
    ) params
  ) external payable returns (uint256 amountOut)`,
  // Jika PRJX menggunakan Uniswap V4 style (unlock/callback):
  // uncomment dan sesuaikan bila diperlukan
];

// ─────────────────────────────────────────────
//  HELPER FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Format jumlah token dengan desimal yang benar
 */
function formatAmount(amount, decimals, symbol) {
  return `${ethers.formatUnits(amount, decimals)} ${symbol}`;
}

/**
 * Hitung amountOutMinimum berdasarkan slippage
 * @param {bigint} amountIn - jumlah input dalam unit terkecil
 * @param {number} slippageBps - slippage dalam basis poin (100 = 1%)
 */
function applySlippage(amountIn, slippageBps = 50) {
  // Untuk stablecoin pair, output ≈ input. Kurangi slippage dari input.
  return (amountIn * BigInt(10000 - slippageBps)) / BigInt(10000);
}

/**
 * Cek dan setujui (approve) token jika allowance tidak cukup
 */
async function ensureApproval(tokenContract, spender, amount, signer) {
  const owner = await signer.getAddress();
  const allowance = await tokenContract.allowance(owner, spender);

  if (allowance < amount) {
    console.log(`  📝 Menyetujui token...`);
    const tx = await tokenContract.approve(spender, ethers.MaxUint256);
    console.log(`  ⏳ Menunggu konfirmasi approve: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Approve berhasil!`);
  } else {
    console.log(`  ✅ Allowance sudah cukup, skip approve`);
  }
}

// ─────────────────────────────────────────────
//  SWAP 1: USDT0 → USDH di HyperEVM (Project X)
// ─────────────────────────────────────────────
async function swapUSDT0toUSDH(amountIn, slippageBps = 50) {
  console.log("\n" + "═".repeat(60));
  console.log("  SWAP 1: USDT0 → USDH di HyperEVM (Project X / PRJX)");
  console.log("═".repeat(60));

  // ── Setup provider & signer ──
  const provider = new ethers.JsonRpcProvider(NETWORKS.hyperevm.rpc);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const walletAddress = await signer.getAddress();

  console.log(`  👛 Wallet: ${walletAddress}`);
  console.log(`  🌐 Network: ${NETWORKS.hyperevm.name} (Chain ID: ${NETWORKS.hyperevm.chainId})`);

  // ── Cek saldo HYPE (gas token) ──
  const hypeBalance = await provider.getBalance(walletAddress);
  console.log(`  ⛽ HYPE Balance (gas): ${ethers.formatEther(hypeBalance)} HYPE`);
  if (hypeBalance < ethers.parseEther("0.001")) {
    console.log("  ❌ HYPE tidak cukup untuk gas! Minimal 0.001 HYPE.");
    return;
  }

  // ── Setup contract objects ──
  const usdt0 = new ethers.Contract(HYPEREVM_CONTRACTS.USDT0, ERC20_ABI, signer);
  const usdh = new ethers.Contract(HYPEREVM_CONTRACTS.USDH, ERC20_ABI, signer);
  const router = new ethers.Contract(HYPEREVM_CONTRACTS.PRJX_ROUTER, PRJX_ROUTER_ABI, signer);

  // ── Ambil info token ──
  const [usdt0Decimals, usdt0Symbol] = await Promise.all([
    usdt0.decimals(),
    usdt0.symbol(),
  ]);
  const [usdhDecimals, usdhSymbol] = await Promise.all([
    usdh.decimals(),
    usdh.symbol(),
  ]);

  // ── Hitung amountIn dalam unit terkecil ──
  const amountInWei = ethers.parseUnits(amountIn.toString(), usdt0Decimals);

  // ── Cek saldo USDT0 ──
  const usdt0Balance = await usdt0.balanceOf(walletAddress);
  console.log(`\n  💰 Saldo ${usdt0Symbol}: ${formatAmount(usdt0Balance, usdt0Decimals, usdt0Symbol)}`);

  if (usdt0Balance < amountInWei) {
    console.log(`  ❌ Saldo ${usdt0Symbol} tidak cukup!`);
    console.log(`     Dibutuhkan: ${formatAmount(amountInWei, usdt0Decimals, usdt0Symbol)}`);
    return;
  }

  // ── Hitung minimum output dengan slippage ──
  const amountOutMinimum = applySlippage(amountInWei, slippageBps);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 menit

  console.log(`\n  🔄 Detail Swap:`);
  console.log(`     Input  : ${formatAmount(amountInWei, usdt0Decimals, usdt0Symbol)}`);
  console.log(`     Output min: ${formatAmount(amountOutMinimum, usdhDecimals, usdhSymbol)}`);
  console.log(`     Slippage: ${slippageBps / 100}%`);
  console.log(`     Fee tier: 0% (Project X 0-fee model)`);

  // ── Approve USDT0 ke router ──
  console.log(`\n  🔐 Mengecek approval...`);
  await ensureApproval(usdt0, HYPEREVM_CONTRACTS.PRJX_ROUTER, amountInWei, signer);

  // ── Eksekusi swap ──
  console.log(`\n  🚀 Mengirim transaksi swap...`);
  try {
    const tx = await router.exactInputSingle({
      tokenIn: HYPEREVM_CONTRACTS.USDT0,
      tokenOut: HYPEREVM_CONTRACTS.USDH,
      fee: 0,            // Project X = 0% fee
      recipient: walletAddress,
      deadline: deadline,
      amountIn: amountInWei,
      amountOutMinimum: amountOutMinimum,
      sqrtPriceLimitX96: 0n, // 0 = tanpa batas harga
    });

    console.log(`  ⏳ Transaksi dikirim! Hash: ${tx.hash}`);
    console.log(`  🔗 Explorer: https://hyperevmscan.io/tx/${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`\n  ✅ SWAP BERHASIL!`);
    console.log(`     Block: ${receipt.blockNumber}`);
    console.log(`     Gas digunakan: ${receipt.gasUsed.toString()}`);

    // ── Cek saldo setelah swap ──
    const usdhBalance = await usdh.balanceOf(walletAddress);
    console.log(`\n  💰 Saldo ${usdhSymbol} sekarang: ${formatAmount(usdhBalance, usdhDecimals, usdhSymbol)}`);
  } catch (err) {
    console.error(`\n  ❌ Swap gagal: ${err.message}`);
    if (err.data) {
      console.error(`     Data error: ${err.data}`);
    }
  }
}

// ─────────────────────────────────────────────
//  SWAP 2: USDT → USDC di Base (Uniswap V3)
// ─────────────────────────────────────────────
async function swapUSDTtoUSDC_Base(amountIn, slippageBps = 50) {
  console.log("\n" + "═".repeat(60));
  console.log("  SWAP 2: USDT → USDC di Base (Uniswap V3)");
  console.log("═".repeat(60));

  // ── Setup provider & signer ──
  const provider = new ethers.JsonRpcProvider(NETWORKS.base.rpc);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const walletAddress = await signer.getAddress();

  console.log(`  👛 Wallet: ${walletAddress}`);
  console.log(`  🌐 Network: ${NETWORKS.base.name} (Chain ID: ${NETWORKS.base.chainId})`);

  // ── Cek saldo ETH (gas token Base) ──
  const ethBalance = await provider.getBalance(walletAddress);
  console.log(`  ⛽ ETH Balance (gas): ${ethers.formatEther(ethBalance)} ETH`);
  if (ethBalance < ethers.parseEther("0.0005")) {
    console.log("  ❌ ETH tidak cukup untuk gas! Minimal 0.0005 ETH.");
    return;
  }

  // ── Setup contract objects ──
  const usdt = new ethers.Contract(BASE_CONTRACTS.USDT, ERC20_ABI, signer);
  const usdc = new ethers.Contract(BASE_CONTRACTS.USDC, ERC20_ABI, signer);
  const router = new ethers.Contract(BASE_CONTRACTS.UNISWAP_ROUTER, UNISWAP_V3_ROUTER_ABI, signer);

  // ── Ambil info token ──
  const [usdtDecimals, usdtSymbol] = await Promise.all([
    usdt.decimals(),
    usdt.symbol(),
  ]);
  const [usdcDecimals, usdcSymbol] = await Promise.all([
    usdc.decimals(),
    usdc.symbol(),
  ]);

  // ── Hitung amountIn dalam unit terkecil ──
  const amountInWei = ethers.parseUnits(amountIn.toString(), usdtDecimals);

  // ── Cek saldo USDT ──
  const usdtBalance = await usdt.balanceOf(walletAddress);
  console.log(`\n  💰 Saldo ${usdtSymbol}: ${formatAmount(usdtBalance, usdtDecimals, usdtSymbol)}`);

  if (usdtBalance < amountInWei) {
    console.log(`  ❌ Saldo ${usdtSymbol} tidak cukup!`);
    console.log(`     Dibutuhkan: ${formatAmount(amountInWei, usdtDecimals, usdtSymbol)}`);
    return;
  }

  // ── Hitung minimum output dengan slippage ──
  // USDT = 6 desimal, USDC = 6 desimal, rasio ~1:1
  const amountOutMinimum = applySlippage(amountInWei, slippageBps);

  console.log(`\n  🔄 Detail Swap:`);
  console.log(`     Input  : ${formatAmount(amountInWei, usdtDecimals, usdtSymbol)}`);
  console.log(`     Output min: ${formatAmount(amountOutMinimum, usdcDecimals, usdcSymbol)}`);
  console.log(`     Slippage: ${slippageBps / 100}%`);
  console.log(`     Fee tier: 0.01% (Uniswap V3 stablecoin pool)`);
  console.log(`     Pool: USDT/USDC 100bps (0.01%)`);

  // ── Approve USDT ke Uniswap router ──
  console.log(`\n  🔐 Mengecek approval...`);
  await ensureApproval(usdt, BASE_CONTRACTS.UNISWAP_ROUTER, amountInWei, signer);

  // ── Eksekusi swap via Uniswap V3 SwapRouter02 ──
  console.log(`\n  🚀 Mengirim transaksi swap...`);
  try {
    const tx = await router.exactInputSingle({
      tokenIn: BASE_CONTRACTS.USDT,
      tokenOut: BASE_CONTRACTS.USDC,
      fee: 100,          // 100 = 0.01% fee tier (stablecoin pool paling liquid)
      recipient: walletAddress,
      amountIn: amountInWei,
      amountOutMinimum: amountOutMinimum,
      sqrtPriceLimitX96: 0n, // 0 = tanpa batas harga
    });

    console.log(`  ⏳ Transaksi dikirim! Hash: ${tx.hash}`);
    console.log(`  🔗 Explorer: https://basescan.org/tx/${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`\n  ✅ SWAP BERHASIL!`);
    console.log(`     Block: ${receipt.blockNumber}`);
    console.log(`     Gas digunakan: ${receipt.gasUsed.toString()}`);

    // ── Cek saldo setelah swap ──
    const usdcBalance = await usdc.balanceOf(walletAddress);
    console.log(`\n  💰 Saldo ${usdcSymbol} sekarang: ${formatAmount(usdcBalance, usdcDecimals, usdcSymbol)}`);
  } catch (err) {
    console.error(`\n  ❌ Swap gagal: ${err.message}`);
    if (err.data) {
      console.error(`     Data error: ${err.data}`);
    }
  }
}

// ─────────────────────────────────────────────
//  DRY RUN - Simulasi tanpa kirim transaksi
// ─────────────────────────────────────────────
async function dryRun() {
  console.log("\n" + "═".repeat(60));
  console.log("  DRY RUN - Cek saldo & simulasi (tidak ada transaksi)");
  console.log("═".repeat(60));

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log("  ❌ PRIVATE_KEY belum diset di .env!");
    return;
  }

  // HyperEVM check
  try {
    const hyperProvider = new ethers.JsonRpcProvider(NETWORKS.hyperevm.rpc);
    const hyperWallet = new ethers.Wallet(privateKey, hyperProvider);
    const addr = await hyperWallet.getAddress();
    const hype = await hyperProvider.getBalance(addr);

    const usdt0 = new ethers.Contract(HYPEREVM_CONTRACTS.USDT0, ERC20_ABI, hyperProvider);
    const usdh = new ethers.Contract(HYPEREVM_CONTRACTS.USDH, ERC20_ABI, hyperProvider);

    const [usdt0Bal, usdhBal, usdt0Dec, usdhDec] = await Promise.all([
      usdt0.balanceOf(addr),
      usdh.balanceOf(addr),
      usdt0.decimals(),
      usdh.decimals(),
    ]);

    console.log(`\n  [HyperEVM] Wallet: ${addr}`);
    console.log(`    HYPE (gas): ${ethers.formatEther(hype)} HYPE`);
    console.log(`    USDT0     : ${ethers.formatUnits(usdt0Bal, usdt0Dec)}`);
    console.log(`    USDH      : ${ethers.formatUnits(usdhBal, usdhDec)}`);
  } catch (e) {
    console.log(`  ❌ HyperEVM check error: ${e.message}`);
  }

  // Base check
  try {
    const baseProvider = new ethers.JsonRpcProvider(NETWORKS.base.rpc);
    const baseWallet = new ethers.Wallet(privateKey, baseProvider);
    const addr = await baseWallet.getAddress();
    const eth = await baseProvider.getBalance(addr);

    const usdt = new ethers.Contract(BASE_CONTRACTS.USDT, ERC20_ABI, baseProvider);
    const usdc = new ethers.Contract(BASE_CONTRACTS.USDC, ERC20_ABI, baseProvider);

    const [usdtBal, usdcBal, usdtDec, usdcDec] = await Promise.all([
      usdt.balanceOf(addr),
      usdc.balanceOf(addr),
      usdt.decimals(),
      usdc.decimals(),
    ]);

    console.log(`\n  [Base] Wallet: ${addr}`);
    console.log(`    ETH (gas): ${ethers.formatEther(eth)} ETH`);
    console.log(`    USDT     : ${ethers.formatUnits(usdtBal, usdtDec)}`);
    console.log(`    USDC     : ${ethers.formatUnits(usdcBal, usdcDec)}`);
  } catch (e) {
    console.log(`  ❌ Base check error: ${e.message}`);
  }

  console.log("\n  ✅ Dry run selesai. Tidak ada transaksi yang dikirim.");
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  🤖 PRJX + Uniswap Swap Bot");
  console.log("═".repeat(60));

  // Validasi environment variables
  if (!process.env.PRIVATE_KEY) {
    console.error("\n  ❌ ERROR: PRIVATE_KEY tidak ditemukan di .env!");
    console.log("  Buat file .env dengan isi:");
    console.log("    PRIVATE_KEY=0xYOUR_PRIVATE_KEY");
    console.log("    AMOUNT_USDT0=10");
    console.log("    AMOUNT_USDT_BASE=10");
    console.log("    SLIPPAGE_BPS=50");
    process.exit(1);
  }

  const amountUsdt0 = parseFloat(process.env.AMOUNT_USDT0 || "1");
  const amountUsdtBase = parseFloat(process.env.AMOUNT_USDT_BASE || "1");
  const slippageBps = parseInt(process.env.SLIPPAGE_BPS || "50");

  const mode = process.argv[2] || "dryrun";

  switch (mode) {
    case "dryrun":
      await dryRun();
      break;

    case "swap1":
      // Hanya Swap 1: USDT0 → USDH di HyperEVM
      await swapUSDT0toUSDH(amountUsdt0, slippageBps);
      break;

    case "swap2":
      // Hanya Swap 2: USDT → USDC di Base
      await swapUSDTtoUSDC_Base(amountUsdtBase, slippageBps);
      break;

    case "all":
      // Jalankan kedua swap secara berurutan
      await swapUSDT0toUSDH(amountUsdt0, slippageBps);
      await swapUSDTtoUSDC_Base(amountUsdtBase, slippageBps);
      break;

    default:
      console.log("\n  Penggunaan:");
      console.log("    node swap-bot.js dryrun   # Cek saldo saja (aman)");
      console.log("    node swap-bot.js swap1    # USDT0 → USDH di HyperEVM");
      console.log("    node swap-bot.js swap2    # USDT → USDC di Base");
      console.log("    node swap-bot.js all      # Jalankan kedua swap");
  }
}

main().catch((err) => {
  console.error("\n  ❌ Error tidak terduga:", err);
  process.exit(1);
});
