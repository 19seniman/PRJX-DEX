/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 6.0 (FINALIZED)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Konfigurasi Token
const TOKENS = {
    USDT0: { symbol: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", decimals: 6 },
    USDH:  { symbol: "USDH",  address: "0x111111a1a0667d36bd57c0a9f569b98057111111", decimals: 6 },
    WHYPE: { symbol: "WHYPE", address: "0x5555555555555555555555555555555555555555", decimals: 18 }
};

const ROUTER_ADDRESS = "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B";
const RPC_URL = "https://rpc.hyperliquid.xyz/evm";

// Daftar Pasangan Swap
const PAIRS = [
    { name: "USDT0 to USDH",  from: TOKENS.USDT0, to: TOKENS.USDH,  fee: 100  },
    { name: "USDH to USDT0",  from: TOKENS.USDH,  to: TOKENS.USDT0, fee: 100  },
    { name: "USDT0 to WHYPE", from: TOKENS.USDT0, to: TOKENS.WHYPE, fee: 500  },
    { name: "WHYPE to USDT0", from: TOKENS.WHYPE, to: TOKENS.USDT0, fee: 500  }
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

async function runSwap(pair, amount, iteration) {
    console.log(`\n--- Transaksi #${iteration} (${pair.name}) ---`);
    
    try {
        // Konfigurasi Provider (Fix untuk ENS Error)
        const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "hyperliquid", chainId: 999 });
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const walletAddress = await signer.getAddress();
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

        const amountInWei = ethers.parseUnits(amount.toString(), pair.from.decimals);
        
        // 1. Cek Saldo & Approval
        const tokenInContract = new ethers.Contract(pair.from.address, ERC20_ABI, signer);
        const balance = await tokenInContract.balanceOf(walletAddress);
        
        console.log(`  📊 Saldo ${pair.from.symbol}: ${ethers.formatUnits(balance, pair.from.decimals)}`);
        if (balance < amountInWei) throw new Error(`Saldo ${pair.from.symbol} tidak cukup!`);

        const allowance = await tokenInContract.allowance(walletAddress, ROUTER_ADDRESS);
        if (allowance < amountInWei) {
            console.log(`  📝 Approving ${pair.from.symbol}...`);
            const txApprove = await tokenInContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
            await txApprove.wait();
            console.log("  ✅ Approved.");
        }

        // 2. Eksekusi Swap
        const params = {
            tokenIn: pair.from.address,
            tokenOut: pair.to.address,
            fee: pair.fee,
            recipient: walletAddress,
            deadline: Math.floor(Date.now() / 1000) + 300,
            amountIn: amountInWei,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };

        console.log(`  🚀 Swap ${amount} ${pair.from.symbol} ...`);
        const tx = await router.exactInputSingle(params, { gasLimit: 400000 });
        
        console.log(`  ⏳ Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log("  ✅ BERHASIL!");
        } else {
            console.log("  ❌ GAGAL: Reverted.");
        }

    } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
    }
}

async function main() {
    console.clear();
    console.log("==========================================");
    console.log("     🤖 SWAP BOT V6.0 (WHYPE SUPPORT)     ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) return console.log("PRIVATE_KEY kosong!");

    PAIRS.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
    const choice = parseInt(await question("\nPilih nomor: ")) - 1;
    if (isNaN(choice) || !PAIRS[choice]) return console.log("Pilihan salah.");

    const amount = await question(`Jumlah input: `);
    const count = parseInt(await question("Berapa kali? ")) || 1;

    for (let i = 1; i <= count; i++) {
        await runSwap(PAIRS[choice], amount, i);
        if (i < count) await sleep(3000);
    }
    rl.close();
}

main().catch(console.error);
