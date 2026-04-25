/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 6.5 (CLEAN INSTALL)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Konfigurasi Token
const TOKENS = {
    USDT0: { symbol: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", decimals: 6 },
    USDH:  { symbol: "USDH",  address: "0x111111a1a0667d36bd57c0a9f569b98057111111", decimals: 6 },
    WHYPE: { symbol: "WHYPE", address: "0x5555555555555555555555555555555555555555", decimals: 18 }
};

const ROUTER_ADDRESS = "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B";
const RPC_URL = "https://rpc.hyperliquid.xyz/evm";

const PAIRS = [
    { name: "USDT0 to USDH",  from: TOKENS.USDT0, to: TOKENS.USDH,  fee: 100  },
    { name: "USDH to USDT0",  from: TOKENS.USDH,  to: TOKENS.USDT0, fee: 100  },
    { name: "USDT0 to WHYPE", from: TOKENS.USDT0, to: TOKENS.WHYPE, fee: 500  },
    { name: "WHYPE to USDT0", from: TOKENS.WHYPE, to: TOKENS.USDT0, fee: 500  }
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) external returns (bool)", "function allowance(address owner, address spender) external view returns (uint256)", "function balanceOf(address account) external view returns (uint256)"];
const ROUTER_ABI = ["function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"];

async function getLivePrice(pair, router) {
    try {
        const amountIn = ethers.parseUnits("1", pair.from.decimals);
        const params = { tokenIn: pair.from.address, tokenOut: pair.to.address, fee: pair.fee, recipient: "0x0000000000000000000000000000000000000000", deadline: Math.floor(Date.now() / 1000) + 300, amountIn: amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0 };
        const amountOut = await router.callStatic.exactInputSingle(params);
        return Number(ethers.formatUnits(amountOut, pair.to.decimals));
    } catch (e) { return null; }
}

async function monitorPrice(pair) {
    console.clear();
    const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "hyperliquid", chainId: 999 });
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
    let basePrice = await getLivePrice(pair, router);
    if (!basePrice) return console.log("Gagal ambil harga.");
    
    console.log(`Monitoring ${pair.name}`);
    console.log(`Harga Awal: ${basePrice.toFixed(6)}\n`);

    // Menggunakan ARRAY agar aman dari Syntax Error
    const targets = [0.05, 0.10, 0.15, 0.20, -0.05, -0.10, -0.15, -0.20];
    let triggered = new Array(targets.length).fill(false);

    setInterval(async () => {
        let currentPrice = await getLivePrice(pair, router);
        if (!currentPrice) return;
        let diff = (currentPrice - basePrice) / basePrice;
        
        console.log(`Harga: ${currentPrice.toFixed(6)} (${(diff * 100).toFixed(2)}%)`);

        for (let i = 0; i < targets.length; i++) {
            if (!triggered[i]) {
                if (targets[i] > 0 && diff >= targets[i]) {
                    console.log(`🚨 ALERT: Harga NAIK ${(targets[i] * 100)}%!`);
                    triggered[i] = true;
                } else if (targets[i] < 0 && diff <= targets[i]) {
                    console.log(`⚠️ ALERT: Harga TURUN ${(Math.abs(targets[i]) * 100)}%!`);
                    triggered[i] = true;
                }
            }
        }
    }, 5000);
}

async function runSwap(pair, amount) {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "hyperliquid", chainId: 999 });
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
        const amountInWei = ethers.parseUnits(amount.toString(), pair.from.decimals);
        
        const params = { tokenIn: pair.from.address, tokenOut: pair.to.address, fee: pair.fee, recipient: await signer.getAddress(), deadline: Math.floor(Date.now() / 1000) + 300, amountIn: amountInWei, amountOutMinimum: 0, sqrtPriceLimitX96: 0 };
        
        console.log(`🚀 Swap ${amount} ${pair.from.symbol}...`);
        const tx = await router.exactInputSingle(params, { gasLimit: 400000 });
        await tx.wait();
        console.log("✅ BERHASIL!");
    } catch (err) { console.log(`❌ Error: ${err.message}`); }
}

async function main() {
    console.clear();
    console.log("=== BOT V6.5 ===");
    console.log("1. Swap\n2. Monitor Harga");
    const menu = await question("Pilih: ");
    
    if (menu === "1") {
        PAIRS.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
        const choice = parseInt(await question("Pilih nomor: ")) - 1;
        const amount = await question("Jumlah: ");
        await runSwap(PAIRS[choice], amount);
    } else if (menu === "2") {
        PAIRS.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
        const choice = parseInt(await question("Pilih nomor: ")) - 1;
        await monitorPrice(PAIRS[choice]);
    }
    rl.close();
}

main().catch(console.error);
