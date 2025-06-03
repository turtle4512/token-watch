import { ethers } from 'ethers';

/* ---------- 配置 ---------- */
const RPC_HTTP = 'https://rpc.ankr.com/bsc/713fa62df477abb027675ff45ff1187bcf6b9d9bdb6d5569f0cf91222a9e13fd';
const TARGET   = '0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db'.toLowerCase();

/* Telegram */
const BOT_TOKEN = '7669259391:AAGjKiTYK56_wCIWEM7TmS0XuzQjZh4q0mg';
const CHAT_ID   = '6773356651';

/* ---------- Provider ---------- */
const provider = new ethers.JsonRpcProvider(RPC_HTTP);

/* ---------- 轮询参数 ---------- */
const POLL_MS   = 10_000;            // 每 10 秒查询一次
let   lastBlock = 0n;                // bigint 保存区块号
const seenToken = new Set();         // 已推送过的代币
const seenTx    = new Set();         // 已推送过的交易哈希

/* Markdown V2 转义 */
function esc(md) {
  return md.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/* 捕获顶层异常，防止容器直接退出 */
process.on('uncaughtException', err => console.error('[Fatal] Uncaught:', err));
process.on('unhandledRejection', err => console.error('[Fatal] Unhandled Promise:', err));

/* ---------- 主循环 ---------- */
setInterval(async () => {
  try {
    const latest = BigInt(await provider.getBlockNumber());
    if (lastBlock === 0n) lastBlock = latest - 1n;

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedTarget  = ethers.zeroPadValue(TARGET, 32);

    const logs = await provider.getLogs({
      fromBlock: (lastBlock + 1n).toString(),
      toBlock  :  latest.toString(),
      topics   : [transferTopic, null, paddedTarget]
    });

    for (const lg of logs) {

      /* Tx 层去重 */
      if (seenTx.has(lg.transactionHash)) continue;
      seenTx.add(lg.transactionHash);

      const token = lg.address.toLowerCase();
      if (seenToken.has(token)) continue;         // 同一代币仅推一次

      /* 取 symbol / decimals（可能失败 → ? / 18） */
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

      /* 把 data 解析成人类可读数量 */
      const amountStr = ethers.formatUnits(BigInt(lg.data), decimals);

      /* 组装 Markdown V2 消息 */
      const msg = [
        '🚨 *新币提醒*',
        `🔖 **符号**：${esc(symbol)}`,
        `🔗 **合约**：\`${token}\``,
        `📦 **收到数量**：${esc(amountStr)}`,
        '⛔ _谨防钓鱼转账，请自行验证真伪…_'
      ].join('\n');

      /* 推送到 Telegram */
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
      seenToken.add(token);           // 标记已提醒
    }

    lastBlock = latest;               // 记录最新区块
  } catch (e) {
    console.error('[Watcher] 轮询出错：', e.message);
  }
}, POLL_MS);

console.log('[Watcher] 轮询版已启动，每 10 秒检查一次…');
