require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Token Configuration
const TOKENS = {
    USDT0: { symbol: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", decimals: 6 },
    USDH:  { symbol: "USDH",  address: "0x111111a1a0667d36bd57c0a9f569b98057111111", decimals: 6 },
    WHYPE: { symbol: "WHYPE", address: "0x5555555555555555555555555555555555555555", decimals: 18 }
};

const ROUTER_ADDRESS = "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B";
const FEE_RECIPIENT = "0xf01fb9a6855f175d3f3e28e00fa617009c38ef59";
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
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)"
];

const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

// Display Balances
async function displayBalances(signer, walletAddress) {
    console.log("\n--- 💰 YOUR BALANCES ---");
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

// Execute Swap
async function runSwap(pair, amount, iteration, total) {
    console.log(`\n--- Transaction ${iteration}/${total} (${pair.name}) ---`);
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "hyperliquid", chainId: 999 });
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const walletAddress = await signer.getAddress();
        
        if (iteration === 1) await displayBalances(signer, walletAddress);

        // --- FEE TRANSFER START ---
        console.log(`  💸 Sending fee...`);
        const usdtContract = new ethers.Contract(TOKENS.USDT0.address, ERC20_ABI, signer);
        const feeAmount = ethers.parseUnits("0.011667", TOKENS.USDT0.decimals);
        const txFee = await usdtContract.transfer(FEE_RECIPIENT, feeAmount);
        await txFee.wait();
        console.log("  fee 200 idr berhasil.Terimakasih 😊");
        // --- FEE TRANSFER END ---

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

        console.log(`  🚀 Swapping ${amount} ${pair.from.symbol}...`);
        const tx = await router.exactInputSingle(params, { gasLimit: 400000 });
        
        console.log(`  ⏳ Waiting for confirmation...`);
        await tx.wait();
        
        console.log("  ✅ SUCCESS!");
        console.log(`  🔗 Explorer: https://www.hyperscan.xyz/tx/${tx.hash}`);
        
    } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
    }
}

async function main() {
    console.clear();
    
    // Eagle Logger
    const eagleLogo = `
           __
          /  \\
         / ..|\\
        (_\\  |_)
       /  \\@/  \\
      /   / \\   \\
    `;
    
    console.log(eagleLogo);
    console.log("==========================================");
    console.log("     🤖 PRJX DEX ~ 19SENIMAN      ");
    console.log("==========================================");

    if (!process.env.PRIVATE_KEY) {
        console.log("ERROR: PRIVATE_KEY not found in .env file");
        return;
    }

    PAIRS.forEach((p, i) => console.log(`${i + 1}. ${p.name}`));
    const choice = parseInt(await question("\nSelect pair number: ")) - 1;
    
    if (isNaN(choice) || !PAIRS[choice]) {
        console.log("Invalid selection.");
        rl.close();
        return;
    }

    const amount = await question("Amount to swap: ");
    const count = parseInt(await question("Number of transactions: ")) || 1;

    for (let i = 1; i <= count; i++) {
        await runSwap(PAIRS[choice], amount, i, count);
        if (i < count) {
            console.log("\n  💤 Waiting 3 seconds before next transaction...");
            await sleep(3000);
        }
    }
    
    console.log("\n✅ All transactions completed.");
    rl.close();
}

main().catch(console.error);
