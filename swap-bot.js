/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 5.2 (HYPEREVM MULTI-PAIR OPTIMIZED)
 * ============================================================
 */

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Konfigurasi Alamat Kontrak di HyperEVM
const TOKENS = {
    USDT0: { symbol: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", decimals: 6 },
    USDH:  { symbol: "USDH",  address: "0x111111a1a0667d36bd57c0a9f569b98057111111", decimals: 6 },
    HYPE:  { symbol: "HYPE",  address: "0x2222222222222222222222222222222222222222", decimals: 18, isNative: true }, 
    PURR:  { symbol: "PURR",  address: "0xC0021B0e504620025F17A9446D3283624E772297", decimals: 8 },
    UBTC:  { symbol: "uBTC",  address: "0x059a45653655181741F8c01d4a046294D256191E", decimals: 8 },
    UETH:  { symbol: "uETH",  address: "0xbD84f09dEF066606a208298711887010C8f62D7D", decimals: 18 },
    FEUSD: { symbol: "feUSD", address: "0x83B367B6667958564F79F88172960683050C3005", decimals: 18 }
};

const ROUTER_ADDRESS = "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B";
const RPC_URL = "https://rpc.hyperliquid.xyz/evm";

// Definisi 11 Pasangan dengan Fee Tier yang disesuaikan
// Fee 100 = 0.01%, 500 = 0.05%, 3000 = 0.3%
const PAIRS = [
    { name: "USDT0 to HYPE",  from: TOKENS.USDT0, to: TOKENS.HYPE,  fee: 3000 },
    { name: "USDH to USDT0",  from: TOKENS.USDH,  to: TOKENS.USDT0, fee: 500  },
    { name: "USDT0 to PURR",  from: TOKENS.USDT0, to: TOKENS.PURR,  fee: 3000 },
    { name: "PURR to USDT0",  from: TOKENS.PURR,  to: TOKENS.USDT0, fee: 3000 },
    { name: "HYPE to USDT0",  from: TOKENS.HYPE,  to: TOKENS.USDT0, fee: 3000 },
    { name: "USDT0 to uBTC",  from: TOKENS.USDT0, to: TOKENS.UBTC,  fee: 500  },
    { name: "uBTC to USDT0",  from: TOKENS.UBTC,  to: TOKENS.USDT0, fee: 500  },
    { name: "USDT0 to uETH",  from: TOKENS.USDT0, to: TOKENS.UETH,  fee: 500  },
    { name: "uETH to USDT0",  from: TOKENS.UETH,  to: TOKENS.USDT0, fee: 500  },
    { name: "USDT0 to feUSD", from: TOKENS.USDT0, to: TOKENS.FEUSD, fee: 500  }, // Diubah ke 500 agar lebih stabil
    { name: "feUSD to USDT0", from: TOKENS.FEUSD, to: TOKENS.USDT0, fee: 500  }
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
    console.log(`\n[#${iteration}] Memproses: ${pair.name}`);

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const walletAddress = await signer.getAddress();
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

        const amountInWei = ethers.parseUnits(amount.toString(), pair.from.decimals);
        const amountOutMinWei = 0; // Menggunakan 0 untuk meminimalisir revert karena slippage

        // 1. Approval (Lewati jika token asal adalah Native HYPE)
        if (!pair.from.isNative) {
            const tokenInContract = new ethers.Contract(pair.from.address, ERC20_ABI, signer);
            const allowance = await tokenInContract.allowance(walletAddress, ROUTER_ADDRESS);
            
            if (allowance < amountInWei) {
                console.log(`  📝 Mengizinkan (Approve) ${pair.from.symbol}...`);
                const txApprove = await tokenInContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
                await txApprove.wait();
                console.log("  ✅ Approval Berhasil.");
            }
        }

        // 2. Setup Parameter Swap
        const params = {
            tokenIn: pair.from.address,
            tokenOut: pair.to.address,
            fee: pair.fee,
            recipient: walletAddress,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            amountIn: amountInWei,
            amountOutMinimum: amountOutMinWei,
            sqrtPriceLimitX96: 0
        };

        console.log(`  🚀 Eksekusi Swap ${amount} ${pair.from.symbol}...`);
        
        let tx;
        if (pair.from.isNative) {
            // Swap dari HYPE Native ke Token lain
            tx = await router.exactInputSingle(params, { 
                value: amountInWei, 
                gasLimit: 350000 
            });
        } else {
            // Swap antar ERC20
            tx = await router.exactInputSingle(params, { 
                gasLimit: 350000 
            });
        }

        console.log(`  ⏳ Menunggu Konfirmasi... (Hash: ${tx.hash})`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log("  ✅ TRANSAKSI BERHASIL!");
        } else {
            console.log("  ❌ TRANSAKSI GAGAL (Reverted on-chain)");
        }

    } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
        if (err.data) console.log(`  🔍 Data Error: ${err.data}`);
    }
}

async function main() {
    console.clear();
    console.log("==========================================");
    console.log("    🤖 HYPEREVM MULTI-PAIR SWAP BOT       ");
    console.log("    Support: USDT0, USDH, HYPE, PURR,     ");
    console.log("             uBTC, uETH, feUSD            ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) {
        console.log("Error: PRIVATE_KEY tidak ditemukan di file .env");
        process.exit(1);
    }

    console.log("Pilih Pasangan:");
    PAIRS.forEach((pair, index) => {
        console.log(`${index + 1}. ${pair.name} (Fee: ${pair.fee / 10000}%)`);
    });

    const choice = parseInt(await question("\nMasukkan nomor pilihan (1-11): ")) - 1;
    if (isNaN(choice) || !PAIRS[choice]) {
        console.log("Pilihan tidak tersedia.");
        rl.close();
        return;
    }

    const selectedPair = PAIRS[choice];
    const amount = await question(`Jumlah ${selectedPair.from.symbol} yang di-swap: `);
    const count = parseInt(await question("Jumlah repetisi transaksi: ")) || 1;
    const delay = parseInt(await question("Jeda antar transaksi (detik): ")) || 5;

    for (let i = 1; i <= count; i++) {
        await runSwap(selectedPair, amount, i);
        if (i < count) {
            console.log(`\n😴 Jeda ${delay} detik...`);
            await sleep(delay * 1000);
        }
    }

    console.log("\nSemua antrean transaksi telah diproses.");
    rl.close();
}

main().catch((err) => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
