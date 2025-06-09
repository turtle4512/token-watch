import { ethers } from 'ethers';

export const OKLINK_TX = 'https://www.oklink.com/zh-hans/bsc/tx/';

export const esc = (s) => s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

export function formatTx(tx) {
  return [
    `🚨 *交易提醒*`,
    `📤 **From**：${esc(tx.from ? tx.from.toLowerCase() : '(null)')}`,
    `📥 **To**：${esc(tx.to ? tx.to.toLowerCase() : '(null)')}`,
    `💸 **Value**：${esc(ethers.formatUnits(tx.value, 18))}`,
    `🔍 **Tx**：[${esc(tx.hash)}](${OKLINK_TX}${tx.hash})`
  ].join('\n');
}

async function lookupSignature(topic0) {
  try {
    const url = `https://www.4byte.directory/api/v1/event-signatures/?hex_signature=${topic0}`;
    const res = await fetch(url).then(r => r.json());
    return res.results?.[0]?.text_signature || null;
  } catch {
    return null;
  }
}

export async function formatEventLog(log) {
  const sig = await lookupSignature(log.topics[0]);
  if (!sig) {
    return [
      `🚨 *事件提醒*`,
      `🔗 **合约**：${esc(log.address.toLowerCase())}`,
      `📝 **Topic0**：${esc(log.topics[0])}`,
      `🔍 **Tx**：[${esc(log.transactionHash)}](${OKLINK_TX}${log.transactionHash})`
    ].join('\n');
  }

  try {
    const iface = new ethers.Interface([`event ${sig}`]);
    const parsed = iface.parseLog(log);
    const args = Object.entries(parsed.args)
      .filter(([k]) => isNaN(Number(k)))
      .map(([k, v]) => {
        let val = v;
        if (typeof val === 'bigint') val = val.toString();
        if (ethers.isAddress(val)) val = val.toLowerCase();
        return `➡️ **${k}**：${esc(String(val))}`;
      });

    return [
      `🚨 *事件提醒*`,
      `🔗 **合约**：${esc(log.address.toLowerCase())}`,
      `📝 **事件**：${esc(sig)}`,
      ...args,
      `🔍 **Tx**：[${esc(log.transactionHash)}](${OKLINK_TX}${log.transactionHash})`
    ].join('\n');
  } catch {
    return [
      `🚨 *事件提醒*`,
      `🔗 **合约**：${esc(log.address.toLowerCase())}`,
      `📝 **事件**：${esc(sig)}`,
      `🔍 **Tx**：[${esc(log.transactionHash)}](${OKLINK_TX}${log.transactionHash})`
    ].join('\n');
  }
}
