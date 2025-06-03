import { ethers } from 'ethers';
import fetch from 'node-fetch';          // Node 18 已内置，但保留更保险

/* ===== 基本配置 ===== */
const RPC_HTTP = process.env.RPC_HTTP   // Railway 中填写
              || 'https://rpc.ankr.com/bsc/你的_API_KEY';   // 先填你的 Ankr HTTPS
const TARGET   = '0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db'.toLowerCase();

/* Telegram（已锁死） */
const BOT_TOKEN = '7669259391:AAGjKiTYK56_wCIWEM7TmS0XuzQjZh4q0mg';
const CHAT_ID   = '6773356651';

/* ===== 创建 JSON-RPC provider ===== */
const provider = new ethers.JsonRpcProvider(RPC_HTTP);

/* ===== 轮询参数 ===== */
const POLL_MS     = 10_000;             // 每 10 秒查询一次
const seenToken   = new Set();          // 已推送过的 token
let   lastBlock   = 0;

/* 主循环：定时拉取新日志 */
setInterval(async () => {
  try {
    const latest = await provider.getBlockNumber();
    if (lastBlock === 0) { lastBlock = latest - 1; }

    // 构造 Transfer 事件过滤器
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedTarget  = ethers.zeroPadValue(TARGET, 32);

    const logs = await provider.getLogs({
      fromBlock: lastBlock + 1,
      toBlock  : latest,
      topics   : [transferTopic, null, paddedTarget]
    });

    for (const lg of logs) {
      const token = lg.address.toLowerCase();
      if (seenToken.has(token)) continue;           // 只通知首次

      let symbol = '?';
      try {
        const erc = new ethers.Contract(token, ['function symbol() view returns (string)'], provider);
        symbol    = await erc.symbol();
      } catch {}

      const msg = `🚀 首次转入 ${symbol} (${token})\\nTx: ${lg.transactionHash}`;
      console.log(msg);

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method : 'POST',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify({ chat_id: CHAT_ID, text: msg })
      });

      seenToken.add(token);
    }

    lastBlock = latest;
  } catch (e) {
    console.error('[Watcher] 轮询出错：', e.message);
  }
}, POLL_MS);

console.log('[Watcher] 轮询版已启动，每 10 秒检查一次…');
