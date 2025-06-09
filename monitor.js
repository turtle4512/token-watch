import { ethers } from 'ethers';
import { esc, formatTx, formatEventLog, OKLINK_TX } from './helpers.js';

/* ---------- 参数检测 ---------- */
const runOnce = process.argv.includes('--once');

/* ---------- 配置 ---------- */
const RPC_HTTP = 'https://rpc.ankr.com/bsc/713fa62df477abb027675ff45ff1187bcf6b9d9bdb6d5569f0cf91222a9e13fd';
const TARGET   = '0x93dEb693b170d56BdDe1B0a5222B14c0F885d976'.toLowerCase();

/* Telegram */
const BOT_TOKEN = '7669259391:AAGjKiTYK56_wCIWEM7TmS0XuzQjZh4q0mg';
const CHAT_ID   = '6773356651';

/* ---------- Provider ---------- */
const provider = new ethers.JsonRpcProvider(RPC_HTTP);

/* 自动补充 fetch（Node < 18） */
if (typeof fetch === 'undefined') {
  const { default: f } = await import('node-fetch');
  global.fetch = f;
}

/* ---------- 工具函数 ---------- */
async function getBlockWithTxs(bn) {
  if (provider.getBlockWithTransactions) return provider.getBlockWithTransactions(bn);
  if (provider.getBlock) return provider.getBlock(bn, true);
  return { transactions: [] };
}

/* ---------- 轮询设置 ---------- */
const POLL_MS   = 10_000;
let   lastBlock = 0n;
const seenLog   = new Set();

process.on('uncaughtException',  e => console.error('[Fatal] Uncaught:', e));
process.on('unhandledRejection', e => console.error('[Fatal] Unhandled:', e));

/* ---------- 获取单价 ---------- */
async function getPriceUsd(addr){
  try{
    const url = `https://api.dexscreener.com/latest/dex/tokens/${addr}`;
    const res = await fetch(url).then(r=>r.json());
    return res.pairs?.[0]?.priceUsd || '?';
  }catch{return '?';}
}

/* ---------- 主循环 ---------- */
async function poll(){
  try {
    const latest = BigInt(await provider.getBlockNumber());
    if (lastBlock === 0n) lastBlock = latest - 1n;

    for (let bn = lastBlock + 1n; bn <= latest; bn++) {
      const blk = await getBlockWithTxs(bn);
      for (const tx of blk.transactions || []) {
        const from = tx.from?.toLowerCase() || '';
        const to   = tx.to?.toLowerCase()   || '';
        if (from === TARGET || to === TARGET) {
          const msg = formatTx(tx);
          await sendTg(msg);
          console.log('[Watcher] 已推送交易', tx.hash);
        }
      }
    }

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedTarget  = ethers.zeroPadValue(TARGET, 32);

    const topicSets = [
      [transferTopic, null, paddedTarget],           // ERC-20 / ERC-721 Transfer to target
      [transferTopic, null, null, paddedTarget]      // ERC-1155 TransferSingle to target
    ];

    let logs = [];
    for (const topics of topicSets) {
      logs.push(...await provider.getLogs({
        fromBlock: ethers.toQuantity(lastBlock + 1n),
        toBlock  : ethers.toQuantity(latest),
        topics
      }));
    }

    logs.push(...await provider.getLogs({
      fromBlock: ethers.toQuantity(lastBlock + 1n),
      toBlock  : ethers.toQuantity(latest),
      address  : TARGET
    }));

    for (const lg of logs) {
      const logId = `${lg.transactionHash}:${lg.logIndex}`;
      if (seenLog.has(logId)) continue;
      seenLog.add(logId);

      if (lg.topics[0] === transferTopic) {
        const token     = lg.address.toLowerCase();
        const fromAddr  = '0x' + lg.topics[1].slice(26).toLowerCase();
        const toAddr    = '0x' + lg.topics[2].slice(26).toLowerCase();

        let symbol='?', decimals=18;
        try{
          const erc = new ethers.Contract(token,[
            'function symbol() view returns (string)',
            'function decimals() view returns (uint8)'
          ], provider);
          symbol   = await erc.symbol();
          decimals = await erc.decimals();
        }catch{}

        const amount = ethers.formatUnits(BigInt(lg.data), decimals);
        const price  = await getPriceUsd(token);
        const value  = (price !== '?' ? (Number(price)*Number(amount)).toLocaleString(undefined,{maximumFractionDigits:2}) : '?');

        const msg = [
          `🚨 *转账提醒*`,
          `🔖 **符号**：${esc(symbol)}`,
          `🔗 **代币合约**：${esc(token)}`,
          `📤 **From**：${esc(fromAddr)}`,
          `📥 **To**：${esc(toAddr)}`,
          `📦 **数量**：${esc(amount)}`,
          `💰 **单价**：$${esc(price)}`,
          `💵 **价值**：$${esc(value)}`,
          `🔍 **Tx**：[${esc(lg.transactionHash)}](${OKLINK_TX}${lg.transactionHash})`
        ].join('\n');

        await sendTg(msg);
        console.log('[Watcher] 已推送', symbol);
      } else {
        const msg = await formatEventLog(lg);
        await sendTg(msg);
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

/* ---------- 推送 Telegram ---------- */
async function sendTg(text){
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ chat_id: CHAT_ID, text, parse_mode:'MarkdownV2' })
  });
}

poll();
console.log('[Watcher] 轮询版已启动，每 10 秒检查一次…');
