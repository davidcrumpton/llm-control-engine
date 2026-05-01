import { Ollama } from 'ollama';
const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });

async function test() {
  const res = await ollama.chat({
    model: 'gemma4:e2b',
    messages: [
      { role: 'user', content: 'Here is some code:\nfunction hello() { return "world"; }' },
      { role: 'user', content: 'Instruction: Write a readme for the above code.' }
    ]
  });
  console.log(res.message.content);
}
test();
