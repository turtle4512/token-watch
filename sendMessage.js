import process from 'node:process';

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const MESSAGE = process.argv.slice(2).join(' ') || 'Test message';

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Please set BOT_TOKEN and CHAT_ID environment variables');
  process.exit(1);
}

async function send(){
  try{
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({chat_id: CHAT_ID, text: MESSAGE})
    });
    const data = await res.json();
    console.log('Response:', data);
  }catch(e){
    console.error('Error:', e.message);
  }
}

send();
