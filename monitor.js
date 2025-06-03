import { ethers } from 'ethers';
import fetch from 'node-fetch';

//============== 配置区 =================
const RPC_WS  = process.env.RPC_WS || 'wss://bsc-ws-node.nariox.org';   // 如需换节点就改这里
const TARGET  = '0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db'.toLowerCase();

const BOT_TOKEN = '7669259391:AAGjKiTYK56_wCIWEM7TmS0XuzQjZh4q0mg';
const CHAT_ID   = '6773356651';
//======================================

// 建立 WebSocket 连接
const provider      = new ethers.WebSocketProvider(RPC_WS);
const transferTopic = ethers.id('Transfer(address,address,uint256)');
const paddedTarget  = ethers.zeroPadValue(TARGET, 32);
const filter        = { topics: [transferTopic, null, paddedTarget] };
const seen          = new Set();

provider.on(filter, async (log) => {
  const token = log.address.toLowerCase();
  if (seen.has(token)) return;           // 已提醒过就跳过
  seen.add(token);

  let symbol = '?';
  try {
    const erc = new ethers.Contract(token, ['function symbol() view returns (string)'], provider);
    symbol    = await erc.symbol();
  } catch {}

  const msg = `🚀 首次转入 ${symbol} (${token})\\nTx: ${log.transactionHash}`;
  console.log(msg);

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
  });
});

if (provider.websocket) {
  provider.websocket.on('open',  () => console.log('[Watcher] 已连接，开始监听…'));
  provider.websocket.on('close', () => console.error('[Watcher] WS 关闭，Railway 会自动重启'));
  provider.websocket.on('error', (e) => console.error('[Watcher] WS error:', e.message));
}
