import { ethers } from 'ethers';

export const esc = (s) => s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

export function formatTx(tx) {
  return [
    '🚨 *交易提醒*',
    `📤 **From**：\`${tx.from ? tx.from.toLowerCase() : '(null)'}\``,
    `📥 **To**：\`${tx.to ? tx.to.toLowerCase() : '(null)'}\``,
    `💸 **Value**：${esc(ethers.formatUnits(tx.value, 18))}`,
    `🔍 **Tx**：\`${tx.hash}\``
  ].join('\n');
}
