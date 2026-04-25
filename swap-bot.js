/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 3.0 (FIXED ENCODING & DECIMALS)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- CONFIG ---
const NETWORKS = {
    hyperevm: { name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm", chainId: 999 },
    base: { name: "Base", rpc: "https://mainnet.base.org", chainId: 8453 }
};

const CONTRACTS = {
    hyperevm: {
        in: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", // USDT0
        out: "0x111111a1a0667d36bd57c0a9f569b98057111111", // USDH
        router: "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B",
        fee: 100
    },
    base: {
        in: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // USDT
        out: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
        router: "0x2626664c2603336E57B271c5C0b26F421741e481", // SwapRouter02
        fee: 100 // USDT/USDC di Base dominan di tier 0.01%
    }
};

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function balanceOf(address account) external view returns (uint256)"
];

// ABI yang lebih spesifik untuk SwapRouter02
const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

async function runSwap(networkKey, iteration) {
    const netConfig = NETWORKS[networkKey];
    const poolConfig = CONTRACTS[networkKey];
    const amountStr = networkKey === "hyperevm" ? process.env.AMOUNT_USDT0 : process.env.AMOUNT_USDT_BASE;

    console.log(`\n[${netConfig.name} - Transaksi #${iteration}]`);

    const provider = new ethers.JsonRpcProvider(netConfig.rpc);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const walletAddress = await signer.getAddress();

    const tokenIn = new ethers.Contract(poolConfig.in, ERC20_ABI, signer);
    const router = new ethers.Contract(poolConfig.router, ROUTER_ABI, signer);

    // 1. Handle Decimals secara dinamis (Base USDT/USDC = 6)
    const decimals = await tokenIn.decimals();
    const amountInWei = ethers.parseUnits(amountStr || "0.01", decimals);
    
    // 2. Slippage 1% agar lebih aman (100 = 1%)
    const amountOutMinWei = (amountInWei * BigInt(99)) / BigInt(100);

    // 3. Approval Check
    try {
        const allowance = await tokenIn.allowance(walletAddress, poolConfig.router);
        if (allowance < amountInWei) {
            console.log("  📝 Memproses Approval...");
            const txApprove = await tokenIn.approve(poolConfig.router, ethers.MaxUint256);
            await txApprove.wait();
            console.log("  ✅ Approved.");
        }
    } catch (e) { console.log("  ⚠️ Gagal cek/proses approval, mencoba lanjut..."); }

    // 4. Params (Struktur disesuaikan dengan SwapRouter02)
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    
    // Kita coba panggil secara eksplisit agar encoding data terisi
    console.log(`  🚀 Mengirim Swap: ${amountStr} In -> Min ${ethers.formatUnits(amountOutMinWei, decimals)} Out`);

    try {
        // Base biasanya menggunakan parameter dengan Deadline
        // HyperEVM/PRJX terkadang tidak butuh. Kita coba versi universal:
        const tx = await router.exactInputSingle({
            tokenIn: poolConfig.in,
            tokenOut: poolConfig.out,
            fee: poolConfig.fee,
            recipient: walletAddress,
            deadline: deadline, // Beberapa router butuh ini
            amountIn: amountInWei,
            amountOutMinimum: amountOutMinWei,
            sqrtPriceLimitX96: 0
        }, {
            gasLimit: 350000 // Force gas limit agar tidak gagal estimate
        });

        console.log(`  ⏳ Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log("  ✅ BERHASIL!");
        } else {
            console.log("  ❌ GAGAL (Reverted by EVM)");
        }
    } catch (err) {
        console.log(`  ❌ Error: ${err.shortMessage || err.message}`);
        if (err.message.includes("deadline")) console.log("     Saran: Cek waktu komputer Anda (Sync NTP).");
    }
}

// --- MAIN MENU ---
async function main() {
    console.clear();
    console.log("==========================================");
    console.log("    🤖 BOT SWAP MULTI-CHAIN V3.0          ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) return console.log("PRIVATE_KEY tidak ada di .env");

    console.log("1. HyperEVM (USDT0 -> USDH)");
    console.log("2. Base (USDT -> USDC)");
    console.log("3. Jalankan Keduanya");
    
    const choice = await question("\nPilih (1-3): ");
    const count = parseInt(await question("Berapa kali loop? ")) || 1;
    const delay = parseInt(await question("Jeda (detik)? ")) || 5;

    for (let i = 1; i <= count; i++) {
        if (choice === "1" || choice === "3") await runSwap("hyperevm", i);
        if (choice === "2" || choice === "3") await runSwap("base", i);
        
        if (i < count) {
            console.log(`\n😴 Menunggu ${delay} detik...`);
            await sleep(delay * 1000);
        }
    }
    console.log("\nSemua selesai.");
    rl.close();
}

main().catch(console.error);
