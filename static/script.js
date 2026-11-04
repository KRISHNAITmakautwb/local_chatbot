const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');

// Fetch models from Ollama API
async function fetchModels() {
    try {
        const res = await fetch('/models');
        const data = await res.json();
        if (data.models && data.models.length > 0) {
            modelSelect.innerHTML = '';
            data.models.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model;
                opt.textContent = model;
                // Select qwen if available, otherwise first model
                if (model.includes('qwen')) opt.selected = true;
                modelSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error fetching models:", e);
    }
}
fetchModels();

// Set options for the marked Markdown parser
marked.setOptions({
    breaks: true,
    gfm: true
});

// Auto-resize textarea
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    sendBtn.disabled = this.value.trim() === '';
});

// Handle Enter to send
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function appendMessage(sender, text, isStreaming = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', `${sender}-message`);

    const innerDiv = document.createElement('div');
    innerDiv.classList.add('message-inner');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar', `${sender}-avatar`);
    if (sender === 'user') {
        avatarDiv.textContent = 'U';
    } else {
        avatarDiv.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    if (isStreaming) {
        contentDiv.classList.add('cursor');
    }

    contentDiv.innerHTML = marked.parse(text || ' ');

    innerDiv.appendChild(avatarDiv);
    innerDiv.appendChild(contentDiv);
    msgDiv.appendChild(innerDiv);
    chatBox.appendChild(msgDiv);

    chatBox.scrollTop = chatBox.scrollHeight;

    contentDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    return contentDiv;
}

async function sendMessage() {
    const prompt = userInput.value.trim();
    if (!prompt) return;

    appendMessage('user', prompt);

    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    const contentDiv = appendMessage('bot', '', true);
    let fullResponse = '';

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                model: modelSelect.value || "llama3",
                web_search: document.getElementById('webSearchToggle').checked
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (let line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.response !== undefined) {
                        fullResponse += data.response;
                        contentDiv.innerHTML = marked.parse(fullResponse);
                        chatBox.scrollTop = chatBox.scrollHeight;
                    }
                } catch (e) {
                    console.error("Error parsing JSON chunk:", e, line);
                }
            }
        }
    } catch (error) {
        fullResponse += "\n\n**Error:** Connection failed. Is the server running?";
        contentDiv.innerHTML = marked.parse(fullResponse);
    } finally {
        contentDiv.classList.remove('cursor');
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
}

sendBtn.addEventListener('click', sendMessage);
