import { ethers } from 'ethers';
import { esc, formatTx } from './helpers.js';

/* ---------- 参数检测 ---------- */
// 使用 --once 参数时仅轮询一次
const runOnce = process.argv.includes('--once');

/* ---------- 配置 ---------- */
const RPC_HTTP = 'https://rpc.ankr.com/bsc/713fa62df477abb027675ff45ff1187bcf6b9d9bdb6d5569f0cf91222a9e13fd';
const TARGET   = '0x93dEb693b170d56BdDe1B0a5222B14c0F885d976'.toLowerCase();

/* Telegram */
const BOT_TOKEN = '7669259391:AAGjKiTYK56_wCIWEM7TmS0XuzQjZh4q0mg';
const CHAT_ID   = '6773356651';

/* ---------- Provider ---------- */
const provider = new ethers.JsonRpcProvider(RPC_HTTP);

async function getBlockWithTxs(bn) {
  if (typeof provider.getBlockWithTransactions === 'function') {
    return await provider.getBlockWithTransactions(bn);
  }
  if (typeof provider.getBlock === 'function') {
    return await provider.getBlock(bn, true);
  }
  return { transactions: [] };
}

/* ---------- 轮询 & 去重 ---------- */
const POLL_MS   = 10_000;
let   lastBlock = 0n;
const seenLog   = new Set();

/* 捕捉顶层异常防止容器退出 */
process.on('uncaughtException',  e => console.error('[Fatal] Uncaught:', e));
process.on('unhandledRejection', e => console.error('[Fatal] Unhandled:', e));

/* ---------- 获取单价 ---------- */
async function getPriceUsd(addr){
  try{
    const url = `https://api.dexscreener.com/latest/dex/tokens/${addr}`;
    const res = await fetch(url).then(r=>r.json());
    return res.pairs?.[0]?.priceUsd || '?';
  }catch{
    return '?';
  }
}

/* ---------- 主循环 ---------- */
async function poll(){
  try {
    const latest = BigInt(await provider.getBlockNumber());
    if (lastBlock === 0n) lastBlock = latest - 1n;

    for (let bn = lastBlock + 1n; bn <= latest; bn++) {
      const blk = await getBlockWithTxs(bn);
      for (const tx of blk.transactions || []) {
        if (tx.from.toLowerCase() === TARGET || (tx.to && tx.to.toLowerCase() === TARGET)) {
          const msg = formatTx(tx);
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({
              chat_id   : CHAT_ID,
              text      : msg,
              parse_mode: 'MarkdownV2'
            })
          });
          console.log('[Watcher] 已推送交易', tx.hash);
        }
      }
    }

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedTarget  = ethers.zeroPadValue(TARGET, 32);

    const topicSets = [
      [null, paddedTarget],
      [null, null, paddedTarget],
      [null, null, null, paddedTarget]
    ];

    let logs = [];
    for (const topics of topicSets) {
      const part = await provider.getLogs({
        fromBlock: ethers.toQuantity(lastBlock + 1n),
        toBlock  : ethers.toQuantity(latest),
        topics
      });
      logs.push(...part);
    }

    const addrPart = await provider.getLogs({
      fromBlock: ethers.toQuantity(lastBlock + 1n),
      toBlock  : ethers.toQuantity(latest),
      address  : TARGET
    });
    logs.push(...addrPart);

    for (const lg of logs) {
      const logId = `${lg.transactionHash}:${lg.logIndex}`;
      if (seenLog.has(logId)) continue;
      seenLog.add(logId);

      if (lg.topics[0] === transferTopic) {
        const token = lg.address.toLowerCase();

        /* 读取 symbol & decimals */
        let symbol='?', decimals=18;
        try{
          const erc = new ethers.Contract(token,
            ['function symbol() view returns (string)',
             'function decimals() view returns (uint8)'], provider);
          symbol   = await erc.symbol();
          decimals = await erc.decimals();
        }catch{/* 保留默认值 */}

        /* 收到数量 */
        const amount = ethers.formatUnits(BigInt(lg.data), decimals);

        /* 单价 & 总价值 */
        const price  = await getPriceUsd(token);
        const value  = (price !== '?' ? (Number(price)*Number(amount)).toLocaleString(undefined,{maximumFractionDigits:2}) : '?');

        /* 组装 Telegram 消息 */
        const msg = [
          '🚨 *新币提醒*',
          `🔖 **符号**：${esc(symbol)}`,
          `🔗 **代币合约**：\`${token}\``,
          `📦 **收到数量**：${esc(amount)}`,
          `💰 **单价**：$${price}`,
          `💵 **价值**：$${value}`,
          `🔍 **Tx**：\`${lg.transactionHash}\``
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
      } else {
        const msg = [
          '🚨 *事件提醒*',
          `🔗 **合约**：\`${lg.address.toLowerCase()}\``,
          `📝 **Topic0**：\`${lg.topics[0]}\``,
          `🔍 **Tx**：\`${lg.transactionHash}\``
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

        console.log('[Watcher] 已推送事件', lg.transactionHash);
      }
    }

    lastBlock = latest;
  } catch (e) {
    console.error('[Watcher] 轮询出错：', e.message);
  } finally {
    if (!runOnce) setTimeout(poll, POLL_MS);
  }
}

poll();

console.log('[Watcher] 轮询版已启动，每 10 秒检查一次…');
