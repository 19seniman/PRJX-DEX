/**
 * ============================================================
 * PRJX & UNISWAP BOT - VERSION 5.3 (DEBUG & FIX)
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
    HYPE:  { symbol: "HYPE",  address: "0x2222222222222222222222222222222222222222", decimals: 18, isNative: true }, 
    PURR:  { symbol: "PURR",  address: "0xC0021B0e504620025F17A9446D3283624E772297", decimals: 8 },
    UBTC:  { symbol: "uBTC",  address: "0x059a45653655181741F8c01d4a046294D256191E", decimals: 8 },
    UETH:  { symbol: "uETH",  address: "0xbD84f09dEF066606a208298711887010C8f62D7D", decimals: 18 },
    FEUSD: { symbol: "feUSD", address: "0x83B367B6667958564F79F88172960683050C3005", decimals: 18 }
};

const ROUTER_ADDRESS = "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B";
const RPC_URL = "https://rpc.hyperliquid.xyz/evm";

const PAIRS = [
    { name: "USDT0 to HYPE",  from: TOKENS.USDT0, to: TOKENS.HYPE,  fee: 3000 },
    { name: "USDH to USDT0",  from: TOKENS.USDH,  to: TOKENS.USDT0, fee: 100  }, // Stable biasanya 100
    { name: "USDT0 to PURR",  from: TOKENS.USDT0, to: TOKENS.PURR,  fee: 3000 },
    { name: "PURR to USDT0",  from: TOKENS.PURR,  to: TOKENS.USDT0, fee: 3000 },
    { name: "HYPE to USDT0",  from: TOKENS.HYPE,  to: TOKENS.USDT0, fee: 3000 },
    { name: "USDT0 to uBTC",  from: TOKENS.USDT0, to: TOKENS.UBTC,  fee: 500  },
    { name: "uBTC to USDT0",  from: TOKENS.UBTC,  to: TOKENS.USDT0, fee: 500  },
    { name: "USDT0 to uETH",  from: TOKENS.USDT0, to: TOKENS.UETH,  fee: 500  },
    { name: "uETH to USDT0",  from: TOKENS.UETH,  to: TOKENS.USDT0, fee: 500  },
    { name: "USDT0 to feUSD", from: TOKENS.USDT0, to: TOKENS.FEUSD, fee: 100  }, // COBA FEE 100 (0.01%)
    { name: "feUSD to USDT0", from: TOKENS.FEUSD, to: TOKENS.USDT0, fee: 100  }
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

async function runSwap(pair, amount, iteration) {
    console.log(`\n--- Transaksi #${iteration} ---`);
    
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const walletAddress = await signer.getAddress();
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

        // 1. Cek Saldo & Allowance
        const amountInWei = ethers.parseUnits(amount.toString(), pair.from.decimals);
        
        if (!pair.from.isNative) {
            const tokenInContract = new ethers.Contract(pair.from.address, ERC20_ABI, signer);
            const balance = await tokenInContract.balanceOf(walletAddress);
            
            console.log(`  📊 Saldo ${pair.from.symbol}: ${ethers.formatUnits(balance, pair.from.decimals)}`);
            
            if (balance < amountInWei) {
                throw new Error(`Saldo ${pair.from.symbol} tidak cukup!`);
            }

            const allowance = await tokenInContract.allowance(walletAddress, ROUTER_ADDRESS);
            if (allowance < amountInWei) {
                console.log(`  📝 Memproses Approval...`);
                const txApprove = await tokenInContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
                await txApprove.wait();
                console.log("  ✅ Approved.");
            }
        } else {
            const balanceNative = await provider.getBalance(walletAddress);
            console.log(`  📊 Saldo HYPE: ${ethers.formatEther(balanceNative)}`);
            if (balanceNative < amountInWei) throw new Error("Saldo HYPE tidak cukup!");
        }

        // 2. Params
        const params = {
            tokenIn: pair.from.address,
            tokenOut: pair.to.address,
            fee: pair.fee,
            recipient: walletAddress,
            deadline: Math.floor(Date.now() / 1000) + 300, // 5 menit saja agar lebih ketat
            amountIn: amountInWei,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };

        // 3. Eksekusi
        console.log(`  🚀 Swap ${amount} ${pair.from.symbol} ke ${pair.to.symbol} (Fee: ${pair.fee})...`);
        
        const tx = await router.exactInputSingle(params, { 
            value: pair.from.isNative ? amountInWei : 0,
            gasLimit: 400000 // Ditambah sedikit untuk keamanan
        });

        console.log(`  ⏳ Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log("  ✅ BERHASIL!");
        } else {
            console.log("  ❌ GAGAL: Reverted.");
        }

    } catch (err) {
        console.log(`  ❌ Error Detail: ${err.message}`);
    }
}

async function main() {
    console.clear();
    console.log("==========================================");
    console.log("     🤖 DEBUGGER SWAP BOT V5.3            ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) return console.log("PRIVATE_KEY kosong!");

    PAIRS.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
    const choice = parseInt(await question("\nPilih nomor: ")) - 1;
    const amount = await question(`Jumlah input: `);
    const count = parseInt(await question("Berapa kali? ")) || 1;

    for (let i = 1; i <= count; i++) {
        await runSwap(PAIRS[choice], amount, i);
        if (i < count) await sleep(3000);
    }
    rl.close();
}

main().catch(console.error);
