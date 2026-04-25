/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 5.1 (HYPEREVM MULTI-PAIR)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Konfigurasi Token HyperEVM
const TOKENS = {
    USDT0: { symbol: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", decimals: 6 },
    USDH:  { symbol: "USDH",  address: "0x111111a1a0667d36bd57c0a9f569b98057111111", decimals: 6 },
    HYPE:  { symbol: "HYPE",  address: "0x2222222222222222222222222222222222222222", decimals: 18, isNative: true }, // Wrapped HYPE
    PURR:  { symbol: "PURR",  address: "0xC0021B0e504620025F17A9446D3283624E772297", decimals: 8 },
    UBTC:  { symbol: "uBTC",  address: "0x059a45653655181741F8c01d4a046294D256191E", decimals: 8 },
    UETH:  { symbol: "uETH",  address: "0xbD84f09dEF066606a208298711887010C8f62D7D", decimals: 18 },
    FEUSD: { symbol: "feUSD", address: "0x83B367B6667958564F79F88172960683050C3005", decimals: 18 }
};

const ROUTER_ADDRESS = "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B";
const RPC_URL = "https://rpc.hyperliquid.xyz/evm";

const PAIRS = [
    { name: "USDT0 to HYPE",  from: TOKENS.USDT0, to: TOKENS.HYPE },
    { name: "USDH to USDT0",  from: TOKENS.USDH,  to: TOKENS.USDT0 },
    { name: "USDT0 to PURR",  from: TOKENS.USDT0, to: TOKENS.PURR },
    { name: "PURR to USDT0",  from: TOKENS.PURR,  to: TOKENS.USDT0 },
    { name: "HYPE to USDT0",  from: TOKENS.HYPE,  to: TOKENS.USDT0 },
    { name: "USDT0 to uBTC",  from: TOKENS.USDT0, to: TOKENS.UBTC },
    { name: "uBTC to USDT0",  from: TOKENS.UBTC,  to: TOKENS.USDT0 },
    { name: "USDT0 to uETH",  from: TOKENS.USDT0, to: TOKENS.UETH },
    { name: "uETH to USDT0",  from: TOKENS.UETH,  to: TOKENS.USDT0 },
    { name: "USDT0 to feUSD", from: TOKENS.USDT0, to: TOKENS.FEUSD },
    { name: "feUSD to USDT0", from: TOKENS.FEUSD, to: TOKENS.USDT0 }
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

async function runSwap(pair, amount, iteration) {
    console.log(`\n[Transaksi #${iteration}: ${pair.name}]`);

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const walletAddress = await signer.getAddress();
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

        const amountInWei = ethers.parseUnits(amount.toString(), pair.from.decimals);
        const amountOutMinWei = 0; // Untuk simulasi, set 0. Sebaiknya gunakan oracle/quoter untuk slippage.

        // 1. Approval (Hanya untuk non-native token)
        if (!pair.from.isNative) {
            const tokenInContract = new ethers.Contract(pair.from.address, ERC20_ABI, signer);
            const allowance = await tokenInContract.allowance(walletAddress, ROUTER_ADDRESS);
            if (allowance < amountInWei) {
                console.log(`  📝 Approving ${pair.from.symbol}...`);
                const txApprove = await tokenInContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
                await txApprove.wait();
                console.log("  ✅ Approved.");
            }
        }

        // 2. Params
        const params = {
            tokenIn: pair.from.address,
            tokenOut: pair.to.address,
            fee: 100, // Fee 0.01%
            recipient: walletAddress,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            amountIn: amountInWei,
            amountOutMinimum: amountOutMinWei,
            sqrtPriceLimitX96: 0
        };

        // 3. Eksekusi
        console.log(`  🚀 Swapping ${amount} ${pair.from.symbol}...`);
        
        let tx;
        if (pair.from.isNative) {
            // Jika swap dari HYPE (Native)
            tx = await router.exactInputSingle(params, { 
                value: amountInWei, 
                gasLimit: 300000 
            });
        } else {
            tx = await router.exactInputSingle(params, { 
                gasLimit: 300000 
            });
        }

        console.log(`  ⏳ Hash: ${tx.hash}`);
        await tx.wait();
        console.log("  ✅ BERHASIL!");

    } catch (err) {
        console.log(`  ❌ Error: ${err.reason || err.message}`);
    }
}

async function main() {
    console.clear();
    console.log("==========================================");
    console.log("    🤖 HYPEREVM MULTI-PAIR SWAP BOT       ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) return console.log("PRIVATE_KEY tidak ditemukan!");

    console.log("Pilih Pasangan Swap:");
    PAIRS.forEach((pair, index) => {
        console.log(`${index + 1}. ${pair.name}`);
    });

    const choice = parseInt(await question("\nPilih nomor (1-11): ")) - 1;
    if (isNaN(choice) || !PAIRS[choice]) return console.log("Pilihan tidak valid.");

    const selectedPair = PAIRS[choice];
    const amount = await question(`Berapa banyak ${selectedPair.from.symbol}? `);
    const count = parseInt(await question("Berapa kali transaksi? ")) || 1;
    const delay = parseInt(await question("Jeda antar transaksi (detik)? ")) || 5;

    for (let i = 1; i <= count; i++) {
        await runSwap(selectedPair, amount, i);
        if (i < count) {
            console.log(`\n😴 Menunggu ${delay} detik...`);
            await sleep(delay * 1000);
        }
    }
    console.log("\nSemua tugas selesai.");
    rl.close();
}

main().catch(console.error);
