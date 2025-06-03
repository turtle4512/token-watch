import { ethers } from 'ethers';
import fetch from 'node-fetch';  // Node 18 自带 fetch，但保留兼容

/* ---------- 固定配置 ---------- */
const RPC_HTTP = 'https://rpc.ankr.com/bsc/713fa62df477abb027675ff45ff1187bcf6b9d9bdb6d5569f0cf91222a9e13fd';
const TARGET   = '0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db'.toLowerCase();

/* Telegram */
const BOT_TOKEN = '7669259391:AAGjKiTYK56_wCIWEM7TmS0XuzQjZh4q0mg';
const CHAT_ID   = '6773356651';

/* ---------- Provider ---------- */
const provider = new ethers.JsonRpcProvider(RPC_HTTP);

/* ---------- 轮询参数 ---------- */
const POLL_MS   = 10_000;     // 10 秒
let   lastBlock = 0n;         // 用 bigint 保存区块号
const seenToken = new Set();  // 已推送过的代币
const seenTx    = new Set();  // 已推送过的交易哈希

/* Markdown V2 转义 */
function esc(md) {
  return md.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/* ---------- 主循环 ---------- */
setInterval(async () => {
  try {
    const latest = BigInt(await provider.getBlockNumber());
    if (lastBlock === 0n) lastBlock = latest - 1n;

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedTarget  = ethers.zeroPadValue(TARGET, 32);

    const logs = await provider.getLogs({
      fromBlock: (lastBlock + 1n).toString(),
      toBlock  : latest.toString(),
      topics   : [transferTopic, null, paddedTarget]
    });

    for (const lg of logs) {
      if (seenTx.has(lg.transactionHash)) continue;  // 防止同 Tx 多条日志
      seenTx.add(lg.transactionHash);

      const token = lg.address.toLowerCase();
      if (seenToken.has(token)) continue;            // 已提醒过该代币
      seenToken.add(token);

      /* 获取 symbol / decimals */
      let symbol = '?', decimals = 18;
      try {
        const erc = new ethers.Contract(token, [
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)'
        ], provider);
        symbol   = await erc.symbol();
        decimals = await erc.decimals();
      } catch {}

      /* 解析数量（log.data 是 0x...） */
      const rawAmount = BigInt(lg.data);
      const amountStr = ethers.formatUnits(rawAmount, decimals);

      /* MarkdownV2 消息 */
      const msg = [
        '🚨 *新币提醒*',
        `🔖 **符号**：${esc(symbol)}`,
        `🔗 **合约**：\`${token}\``,
        `📦 **收到数量**：${esc(amountStr)}`,
        '⛔ _谨防钓鱼转账，请自行验证真伪…_'
      ].join('\\n');

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method : 'POST',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify({
          chat_id   : CHAT_ID,
          text      : msg,
          parse_mode: 'MarkdownV2'
        })
      });

      console.log(`[Watcher] 已推送 ${symbol}`);
    }

    lastBlock = latest;                         // 下轮只查新块
  } catch (e) {
    console.error('[Watcher] 轮询出错：', e.message);
  }
}, POLL_MS);

console.log('[Watcher] 轮询版已启动，每 10 秒检查一次…');
