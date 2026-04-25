/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 5.0 (SINGLE CHAIN - HYPEREVM)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NETWORKS = {
    hyperevm: { name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm", chainId: 999 }
};

const CONTRACTS = {
    hyperevm: {
        in: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", // USDT0
        out: "0x111111a1a0667d36bd57c0a9f569b98057111111", // USDH
        router: "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B",
        fee: 100
    }
};

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

async function runSwap(networkKey, iteration) {
    const netConfig = NETWORKS[networkKey];
    const poolConfig = CONTRACTS[networkKey];
    // Menggunakan variabel environment khusus HyperEVM
    const amountStr = process.env.AMOUNT_USDT0;

    console.log(`\n[${netConfig.name} - Transaksi #${iteration}]`);

    try {
        const provider = new ethers.JsonRpcProvider(netConfig.rpc);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const walletAddress = await signer.getAddress();

        const tokenIn = new ethers.Contract(poolConfig.in, ERC20_ABI, signer);
        const router = new ethers.Contract(poolConfig.router, ROUTER_ABI, signer);

        const decimals = await tokenIn.decimals();
        const amountInWei = ethers.parseUnits(amountStr || "0.01", decimals);
        const amountOutMinWei = (amountInWei * BigInt(98)) / BigInt(100); // Slippage 2%

        // 1. Approval Check
        const allowance = await tokenIn.allowance(walletAddress, poolConfig.router);
        if (allowance < amountInWei) {
            console.log("  📝 Memproses Approval...");
            const txApprove = await tokenIn.approve(poolConfig.router, ethers.MaxUint256);
            await txApprove.wait();
            console.log("  ✅ Approved.");
        }

        // 2. Prepare Params
        const params = {
            tokenIn: poolConfig.in,
            tokenOut: poolConfig.out,
            fee: poolConfig.fee,
            recipient: walletAddress,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            amountIn: amountInWei,
            amountOutMinimum: amountOutMinWei,
            sqrtPriceLimitX96: 0
        };

        console.log(`  🚀 Menjalankan Swap...`);

        // 3. Eksekusi
        const swapFunc = router.getFunction("exactInputSingle");
        const tx = await swapFunc(params, {
            gasLimit: 300000 
        });

        console.log(`  ⏳ Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log("  ✅ BERHASIL!");
        } else {
            console.log("  ❌ GAGAL: Transaksi Reverted.");
        }

    } catch (err) {
        console.log(`  ❌ Error: ${err.reason || err.message}`);
        if (err.message.includes("insufficient funds")) {
            console.log("      Pesan: Saldo native token Anda tidak cukup untuk gas fee.");
        }
    }
}

async function main() {
    console.clear();
    console.log("==========================================");
    console.log("    🤖 BOT SWAP HYPEREVM ONLY V5.0        ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) return console.log("PRIVATE_KEY tidak ditemukan di .env!");

    console.log("Jaringan: HyperEVM (USDT0 -> USDH)");
    
    const count = parseInt(await question("\nBerapa kali transaksi? ")) || 1;
    const delay = parseInt(await question("Jeda antar transaksi (detik)? ")) || 5;

    for (let i = 1; i <= count; i++) {
        await runSwap("hyperevm", i);
        
        if (i < count) {
            console.log(`\n😴 Menunggu ${delay} detik...`);
            await sleep(delay * 1000);
        }
    }
    console.log("\nSemua tugas selesai.");
    rl.close();
}

main().catch(console.error);
