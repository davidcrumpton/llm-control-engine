# tags example

```bash
llmctrlx.js chat -u 'Tell me what tools the agent presents to you' -m gemma4:e2b --tags os
```

I have access to the following tools:

* **apropos**: Search man page descriptions by keyword
* **datetime**: Use this tool to get the current date and time
* **df**: Get disk usage (df -h)
* **dmesg**: Get kernel ring buffer
* **ifconfig**: Get network interfaces
* **man**: Get a specific section of a man page
* **netstat**: Get network connections
* **ps**: Get running processes
* **uptime**: Get system uptime
* **whatis**: Get a short description of a command
* **wikipedia_summary**: Get a summary of a topic from Wikipedia

```bash
llmctrlx.js chat -u 'Tell me what tools the agent presents to you' -m gemma4:e2b --tags web
```

I have access to the following tools:

* **datetime**: Use this tool to get the current date and time.
* **http_get**: Fetch a URL.
* **wikipedia_summary**: Get a summary of a topic from Wikipedia.

```bash
llmctrlx.js chat -u 'What can you do?' -m gemma4:e2b --tags web
```

I am a Large Language Model, and I can perform a wide variety of tasks based on text input, including:

* **Answering questions:** I can answer factual questions on a vast range of topics.
* **Generating text:** I can write stories, poems, emails, code, summaries, creative content, and more.
* **Summarizing information:** I can read long texts and provide concise summaries.
* **Translating languages:** I can help with translation tasks.
* **Processing information:** I can analyze text, identify themes, and organize complex information.

Additionally, I have access to specific tools that allow me to perform external actions, such as:

* **Getting the current date and time** using the `datetime` tool.
* **Fetching information from the internet** by fetching URLs using the `http_get` tool.
* **Getting summaries of topics** from Wikipedia using the `wikipedia_summary` tool.