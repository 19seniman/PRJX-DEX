/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 7.0 (STABLE & CLEAN)
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

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

// --- FUNGSI TAMPIL SALDO ---
async function displayBalances(signer, walletAddress) {
    console.log("\n--- 💰 SALDO ANDA ---");
    for (const key in TOKENS) {
        const token = TOKENS[key];
        const contract = new ethers.Contract(token.address, ERC20_ABI, signer);
        try {
            const balance = await contract.balanceOf(walletAddress);
            console.log(`  ${token.symbol.padEnd(6)} : ${ethers.formatUnits(balance, token.decimals)}`);
        } catch (e) {
            console.log(`  ${token.symbol.padEnd(6)} : Error`);
        }
    }
    console.log("----------------------");
}

// --- FUNGSI EKSEKUSI SWAP ---
async function runSwap(pair, amount) {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "hyperliquid", chainId: 999 });
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const walletAddress = await signer.getAddress();
        
        await displayBalances(signer, walletAddress);

        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
        const tokenInContract = new ethers.Contract(pair.from.address, ERC20_ABI, signer);
        const amountInWei = ethers.parseUnits(amount.toString(), pair.from.decimals);

        // Approval
        const allowance = await tokenInContract.allowance(walletAddress, ROUTER_ADDRESS);
        if (allowance < amountInWei) {
            console.log(`  📝 Approving ${pair.from.symbol}...`);
            await (await tokenInContract.approve(ROUTER_ADDRESS, ethers.MaxUint256)).wait();
            console.log("  ✅ Approved.");
        }

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
        await tx.wait();
        console.log("  ✅ BERHASIL!");
    } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
    }
}

async function main() {
    console.clear();
    console.log("==========================================");
    console.log("     🤖 SWAP BOT V7.0 (STABLE)            ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) {
        console.log("ERROR: PRIVATE_KEY tidak ditemukan di file .env");
        return;
    }

    PAIRS.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
    const choice = parseInt(await question("\nPilih nomor pasangan: ")) - 1;
    
    if (isNaN(choice) || !PAIRS[choice]) {
        console.log("Pilihan tidak valid.");
    } else {
        const amount = await question("Jumlah input: ");
        await runSwap(PAIRS[choice], amount);
    }
    rl.close();
}

main().catch(console.error);
