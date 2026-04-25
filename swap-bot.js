/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 6.2 (WITH PRICE MONITOR)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const ERC20_ABI = ["function balanceOf(address account) external view returns (uint256)"];
const ROUTER_ABI = ["function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"];

// --- FITUR MONITOR HARGA ---
async function getLivePrice(pair, provider, router) {
    // Kita simulasikan swap 1 unit token (scaled) untuk dapat harga
    const amountIn = ethers.parseUnits("1", pair.from.decimals);
    const params = {
        tokenIn: pair.from.address,
        tokenOut: pair.to.address,
        fee: pair.fee,
        recipient: "0x0000000000000000000000000000000000000000",
        deadline: Math.floor(Date.now() / 1000) + 300,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    };

    try {
        const amountOut = await router.callStatic.exactInputSingle(params);
        // Hitung harga: 1 Token A = X Token B
        const price = Number(ethers.formatUnits(amountOut, pair.to.decimals));
        return price;
    } catch (e) { return null; }
}

async function monitorPrice(pair) {
    console.clear();
    console.log(`--- MONITORING ${pair.name} ---`);
    console.log("Tekan CTRL+C untuk berhenti.\n");

    const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "hyperliquid", chainId: 999 });
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);

    let basePrice = await getLivePrice(pair, provider, router);
    if (!basePrice) return console.log("Gagal mengambil harga awal.");
    
    console.log(`Harga Awal: ${basePrice.toFixed(6)}`);
    let alerted = { 0.05: false, 0.10: false, 0.15: false, 0.20: false, -0.05: false, -0.10: false, -0.15: false, -0.20: false };

    setInterval(async () => {
        let currentPrice = await getLivePrice(pair, provider, router);
        if (!currentPrice) return;

        let diff = (currentPrice - basePrice) / basePrice;
        let percent = (diff * 100).toFixed(2);
        
        console.log(`Harga: ${currentPrice.toFixed(6)} (${percent}%)`);

        // Logika Threshold
        [0.05, 0.10, 0.15, 0.20, -0.05, -0.10, -0.15, -0.20].forEach(p => {
            if (diff >= p && !alerted[p] && p > 0) {
                console.log(`🚨 ALERT: Harga NAIK ${p * 100}%!`);
                alerted[p] = true;
            } else if (diff <= p && !alerted[p] && p < 0) {
                console.log(`⚠️ ALERT: Harga TURUN ${Math.abs(p * 100)}%!`);
                alerted[p] = true;
            }
        });
    }, 5000); // Cek setiap 5 detik
}

// ... [Fungsi runSwap tetap sama seperti V6.1] ...

async function main() {
    console.clear();
    console.log("==========================================");
    console.log("     🤖 SWAP BOT V6.2 (W/ MONITOR)        ");
    console.log("==========================================");
    console.log("1. Lakukan Swap");
    console.log("2. Monitoring Harga (Deteksi %)");
    
    const menu = await question("\nPilih menu: ");
    
    if (menu === "1") {
        // ... [Kode menu swap] ...
    } else if (menu === "2") {
        PAIRS.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
        const choice = parseInt(await question("\nPilih pair untuk dimonitor: ")) - 1;
        await monitorPrice(PAIRS[choice]);
    }
}

main().catch(console.error);
