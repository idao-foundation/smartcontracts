const { ethers } = require("ethers");
const TradingView = require("@mathieuc/tradingview");
var Jetty = require("jetty");
const jetty = new Jetty(process.stdout);

const provider = new ethers.WebSocketProvider(process.env.POLYGON_URL_WSS);

// MATIC/USD, ETH/USD, BNB/USD, LTC/USD, BTC/USD, DOT/USD, LINK/USD, 
// SNX/USD, SUSHI/USD, SAND/USD, DOGE/USD, ADA/USD, MKR/USD, UNI/USD, 
// (CRV/USD), XRP/USD, AAVE/USD, AVAX/USD, SOL/USD, 1inch/USD, APE/USD, 
// FIL/USD, FTM/USD, KAVA/USD, WOO/USD, YFI/USD, ICP/USD, DASH/USD, 
// COMP/USD, MANA/USD, UMA/USD, ZEC/USD

// (CRV/USD)

const markets = [
    { market: "COINBASE:MATICUSD", oracle: "0xab594600376ec9fd91f8e885dadf0ce036862de0" },
    { market: "COINBASE:ETHUSD", oracle: "0xf9680d99d6c9589e2a93a78a04a279e509205945" },
    { market: "BINANCE:BNBUSD", oracle: "0x82a6c4af830caa6c97bb504425f6a66165c2c26e" },
    { market: "COINBASE:LTCUSD", oracle: "0xeb99f173cf7d9a6dc4d889c2ad7103e8383b6efa" },
    { market: "COINBASE:BTCUSD", oracle: "0x9b489F7Fffa89EA450E3121603e79d9093a9396E" },
    { market: "COINBASE:DOTUSD", oracle: "0xacb51f1a83922632ca02b25a8164c10748001bde" },
    { market: "COINBASE:LINKUSD", oracle: "0xd9ffdb71ebe7496cc440152d43986aae0ab76665" },
    { market: "COINBASE:SNXUSD", oracle: "0xbf90a5d9b6ee9019028dbfc2a9e50056d5252894" },
    { market: "BINANCE:SUSHIUSDT", oracle: "0x49b0c695039243bbfeb8ecd054eb70061fd54aa0" },
    { market: "COINBASE:SANDUSD", oracle: "0x3d49406edd4d52fb7ffd25485f32e073b529c924" },
    { market: "BINANCE:DOGEUSD", oracle: "0xbaf9327b6564454f4a3364c33efeef032b4b4444" },
    { market: "COINBASE:ADAUSD", oracle: "0x882554df528115a743c4537828da8d5b58e52544" },
    { market: "COINBASE:MKRUSD", oracle: "0xa070427bf5ba5709f70e98b94cb2f435a242c46c" },
    { market: "COINBASE:UNIUSD", oracle: "0xdf0fb4e4f928d2dcb76f438575fdd8682386e13c" },
    { market: "COINBASE:XRPUSD", oracle: "0x785ba89291f676b5386652eb12b30cf361020694" },
    { market: "COINBASE:AAVEUSD", oracle: "0x72484b12719e23115761d5da1646945632979bb6" },
    { market: "COINBASE:AVAXUSD", oracle: "0xe01ea2fbd8d76ee323fbed03eb9a8625ec981a10" },
    { market: "COINBASE:SOLUSD", oracle: "0x10c8264c0935b3b9870013e057f330ff3e9c56dc" },
    { market: "COINBASE:1INCHUSD", oracle: "0x443c5116cdf663eb387e72c688d276e702135c87" },
    { market: "COINBASE:APEUSD", oracle: "0x2ac3f3bfac8fc9094bc3f0f9041a51375235b992" },
    { market: "COINBASE:FILUSD", oracle: "0xa07703e5c2ed1516107c7c72a494493dcb99c676" },
    { market: "BINANCE:FTMUSD", oracle: "0x58326c0f831b2dbf7234a4204f28bba79aa06d5f" },
    { market: "COINBASE:KAVAUSD", oracle: "0x7899dd75c329efe63e35b02bc7d60d3739fb23c5" },
    { market: "BINANCE:WOOUSD", oracle: "0x6a99ec84819fb7007dd5d032068742604e755c56" },
    { market: "COINBASE:YFIUSD", oracle: "0x9d3a43c111e7b2c6601705d9fcf7a70c95b1dc55" },
    { market: "COINBASE:ICPUSD", oracle: "0x84227a76a04289473057bef706646199d7c58c34" },
    { market: "COINBASE:DASHUSD", oracle: "0xd94427edee70e4991b4b8ddcc848f2b58ed01c0b" },
    { market: "COINBASE:COMPUSD", oracle: "0x2a8758b7257102461bc958279054e372c2b1bde6" },
    { market: "COINBASE:MANAUSD", oracle: "0xa1cbf3fe43bc3501e3fc4b573e822c70e76a7512" },
    { market: "COINBASE:UMAUSD", oracle: "0x33d9b1baadcf4b26ab6f8e83e9cb8a611b2b3956" },
    { market: "COINBASE:ZECUSD", oracle: "0xbc08c639e579a391c4228f20d0c29d0690092df0" },
];
const logOnlyMaxD = false;

async function addListener(client, market, oracleAddress, index) {
    const oracle = new ethers.Contract(oracleAddress, [
        "function decimals() view returns (uint8)",
        "function latestAnswer() view returns (uint256)",
    ], provider);
    const decimals = await oracle.decimals();

    const chart = new client.Session.Chart();

    chart.onError((error) => {
        jetty.moveTo([markets.length, 0]);
        jetty.text(`${market}`);
        jetty.text(error);
    });

    chart.setMarket(market, {
        timeframe: '1D'
    });

    let maxDeviation = 0;

    const logDiff = (tradingViewPrice, chainlinkPrice, updatedBy) => {
        const diff = tradingViewPrice - chainlinkPrice;
        const percent = (diff / tradingViewPrice) * 100;
        let maxD = false;

        if (Math.abs(diff) > maxDeviation) {
            maxDeviation = Math.abs(diff);
            maxD = true;
        }

        if (logOnlyMaxD && !maxD) return;

        // jetty.text(`[${updatedBy}]\tT: ${tradingViewPrice.toFixed(2)}\tC: ${chainlinkPrice.toFixed(2)}\tD: ${diff.toFixed(8)}\t(${percent.toFixed(4)}%)\tMax|D|: ${maxDeviation.toFixed(8)}\t(${maxDeviationPct.toFixed(4)}%)`);

        let pad = 0;
        jetty.moveTo([index, pad]);
        jetty.clearLine();

        jetty.text(`[${updatedBy}]`);

        pad += 25;
        jetty.moveTo([index, pad]);
        jetty.text(`T: ${tradingViewPrice.toFixed(4)}`);

        pad += 15;
        jetty.moveTo([index, pad]);
        jetty.text(`C: ${chainlinkPrice.toFixed(4)}`);

        pad += 15;
        jetty.moveTo([index, pad]);
        jetty.text(`D: ${diff.toFixed(8)}`);

        pad += 17;
        jetty.moveTo([index, pad]);
        jetty.text(`(${percent.toFixed(4)}%)`);

        pad += 15;
        jetty.moveTo([index, pad]);
        jetty.text(`${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);

        jetty.moveTo(markets.length, 0)
    }

    let currentTradingViewPrice = 0;
    let currentChainlinkPrice = Number(ethers.formatUnits(await oracle.latestAnswer(), decimals));

    chart.onUpdate(() => { // When price changes
        if (!chart.periods[0]) return;
        currentTradingViewPrice = chart.periods[0].close;

        logDiff(currentTradingViewPrice, currentChainlinkPrice, market);
    });

    provider.on({
        address: oracleAddress,
        topics: ["0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"],
    }, (args) => {
        const valueRaw = args.topics[1];
        const value = ethers.toBigInt(valueRaw);
        currentChainlinkPrice = Number(ethers.formatUnits(value, decimals));

        if (currentTradingViewPrice == 0) return;
        logDiff(currentTradingViewPrice, currentChainlinkPrice, market);
    })
}

async function main() {
    const client = new TradingView.Client();

    jetty.nuke();

    for (let i = 0; i < markets.length; i++) {
        const market = markets[i];
        addListener(client, market.market, market.oracle, i);

        // delay 5s
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

main().catch((error) => {
    jetty.moveTo([markets.length, 0]);
    jetty.text(`${error}`);
    process.exit(1);
})