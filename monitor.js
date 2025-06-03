import { ethers } from 'ethers';

/* ---------- 基础配置 ---------- */
const RPC_HTTP = 'https://rpc.ankr.com/bsc/713fa62df477abb027675ff45ff1187bcf6b9d9bdb6d5569f0cf91222a9e13fd';
const TARGET   = '0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db'.toLowerCase();

/* Telegram Bot */
const BOT_TOKEN = '7669259391:AAGjKiTYK56_wCIWEM7TmS0XuzQjZh4q0mg';
const CHAT_ID   = '6773356651';

/* ---------- Provider ---------- */
const provider = new ethers.JsonRpcProvider(RPC_HTTP);

/* ---------- 轮询参数 ---------- */
const POLL_MS   = 10_000;      // 10 秒
let   lastBlock = 0n;          // bigint
const seenToken = new Set();   // 已推送的代币
const seenTx    = new Set();   // 已推送的 Tx

/* Markdown V2 转义 */
const esc = (s) => s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

/* 捕获顶层异常，防止容器直接退出 */
process.on('uncaughtException',  e => console.error('[Fatal] Uncaught:', e));
process.on('unhandledRejection', e => console.error('[Fatal] Unhandled:', e));

/* ---------- 主循环 ---------- */
setInterval(async () => {
  try {
    const latest = BigInt(await provider.getBlockNumber());
    if (lastBlock === 0n) lastBlock = latest - 1n;

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedTarget  = ethers.zeroPadValue(TARGET, 32);

    const logs = await provider.getLogs({
      fromBlock: ethers.toQuantity(lastBlock + 1n),
      toBlock  : ethers.toQuantity(latest),
      topics   : [transferTopic, null, paddedTarget]
    });

    for (const lg of logs) {
      if (seenTx.has(lg.transactionHash)) continue;  // Tx 去重
      seenTx.add(lg.transactionHash);

      const token = lg.address.toLowerCase();
      if (seenToken.has(token)) continue;            // 代币去重

      /* 读 symbol / decimals */
      let symbol = '?', decimals = 18;
      try {
        const erc = new ethers.Contract(
          token,
          ['function symbol() view returns (string)',
           'function decimals() view returns (uint8)'],
          provider
        );
        symbol   = await erc.symbol();
        decimals = await erc.decimals();
      } catch {/* 保留默认值 */}

      /* 解析数量 */
      const amountStr = ethers.formatUnits(BigInt(lg.data), decimals);

      /* 组装 Telegram 消息（Markdown V2） */
      const msg = [
        '🚨 *新币提醒*',
        `🔖 **符号**：${esc(symbol)}`,
        `🔗 **合约**：\`${token}\``,
        `📦 **收到数量**：${esc(amountStr)}`,
        '⛔ _谨防钓鱼转账，请自行验证真伪…_'
      ].join('\n');

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          chat_id   : CHAT_ID,
          text      : msg,
          parse_mode: 'MarkdownV2'
        })
      });

      console.log('[Watcher] 已推送', symbol);
      seenToken.add(token);
    }

    lastBlock = latest;  // 记录区块高度
  } catch (e) {
    console.error('[Watcher] 轮询出错：', e.message);
  }
}, POLL_MS);

console.log('[Watcher] 轮询版已启动，每 10 秒检查一次…');
