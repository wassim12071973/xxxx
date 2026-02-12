// =========================
// CONFIGURATION
// =========================
const API_BASE_URL = "";
const USER_ID = 'user_' + Math.random().toString(36).substr(2, 9);

// =========================
// DOM Elements
// =========================
const chatStream = document.getElementById('chatStream');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const thinkingIndicator = document.getElementById('thinkingIndicator');
const errorMessage = document.getElementById('errorMessage');
const settingsBtn = document.getElementById('settingsBtn');
const attachBtn = document.getElementById('attachBtn');
const resetBtn = document.getElementById('resetBtn');
const serverStatus = document.getElementById('serverStatus');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const welcomeMessage = document.getElementById('welcome-message');
const micBtn = document.getElementById('micBtn');
const voiceStatus = document.getElementById('voiceStatus');
const quickActions = document.querySelectorAll('.quick-action');

// =========================
// STATE MANAGEMENT
// =========================
let isProcessing = false;
let isListening = false;
let recognition = null;
let finalTranscript = '';

// =========================
// MICROPHONE SPEECH RECOGNITION
// =========================
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = function() {
        isListening = true;
        micBtn.classList.add('listening');
        voiceStatus.innerHTML = `
            <div class="recording-indicator">
                <div class="recording-dot"></div>
                <span>Listening... Speak now</span>
            </div>
        `;
    };
    
    recognition.onresult = function(event) {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
                messageInput.value = finalTranscript;
            } else {
                interimTranscript += transcript;
                messageInput.value = finalTranscript + interimTranscript;
            }
        }
    };
    
    recognition.onerror = function(event) {
        let errorMessage = '';
        switch(event.error) {
            case 'no-speech':
                errorMessage = 'No speech detected';
                break;
            case 'audio-capture':
                errorMessage = 'No microphone found';
                break;
            case 'not-allowed':
                errorMessage = 'Microphone access denied';
                break;
            default:
                errorMessage = 'Error: ' + event.error;
        }
        
        voiceStatus.textContent = errorMessage;
        setTimeout(() => {
            voiceStatus.textContent = '';
        }, 3000);
    };
    
    recognition.onend = function() {
        isListening = false;
        micBtn.classList.remove('listening');
        voiceStatus.textContent = '';
        
        if (finalTranscript) {
            messageInput.value = finalTranscript.trim();
        }
        
        finalTranscript = '';
    };
} else {
    if (micBtn) micBtn.style.display = 'none';
    
    const unsupportedMsg = document.createElement('div');
    unsupportedMsg.className = 'error-message';
    unsupportedMsg.textContent = 'Voice input not supported in your browser';
    unsupportedMsg.style.display = 'block';
    unsupportedMsg.style.position = 'static';
    unsupportedMsg.style.marginTop = '10px';
    if (document.querySelector('.input-container')) {
        document.querySelector('.input-container').appendChild(unsupportedMsg);
    }
}

// =========================
// AI FUNCTIONS
// =========================
async function sendToAI(message) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 9990000);

    try {
        const response = await fetch(`${API_BASE_URL}/chat-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                user_id: USER_ID
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        if (!response.body) {
            addMessage("❌ Streaming غير مدعوم في المتصفح", "ai");
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let aiText = "";
        let isFirstChunk = true;

        const aiMessageDiv = addMessage("", "ai");
        const contentDiv = aiMessageDiv.querySelector(".message-text");

        const aiContent = document.createElement("div");
        aiContent.className = "ai-content";

        const aiDot = document.createElement("div");
        aiDot.className = "ai-dot";

        const thinking = document.createElement("span");
        thinking.className = "thinking";
        thinking.innerHTML = `
            Thinking
            <span class="dots">
                <span>.</span><span>.</span><span>.</span>
            </span>
        `;

        aiContent.appendChild(aiDot);
        aiContent.appendChild(thinking);
        const actions = aiMessageDiv.querySelector(".message-actions");
        if (actions) {
            aiMessageDiv.insertBefore(aiContent, actions);
        } else {
            aiMessageDiv.appendChild(aiContent);
        }

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            if (isFirstChunk) {
                aiMessageDiv.querySelector(".thinking")?.remove();
                aiMessageDiv.querySelector(".ai-dot")?.remove();
                isFirstChunk = false;
            }

            aiText += chunk;
            contentDiv.innerHTML = aiText.replace(/\n/g, "<br>");
        }

        aiText += decoder.decode();

        if (/سأتذكر|سوف أتذكر|تم حفظ|تمت إضافة/.test(aiText)) {
            aiMessageDiv.classList.add("memory");
        }

    } catch (error) {
        console.error("Streaming error:", error);
        addMessage("حدث خطأ أثناء توليد الرد", "ai");
    } finally {
        clearTimeout(timeoutId);
    }
}

// =========================
// CONVERSATION MANAGEMENT
// =========================
async function resetConversation() {
    try {
        const response = await fetch(`${API_BASE_URL}/reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: USER_ID
            })
        });
        
        if (response.ok) {
            const messages = chatStream.querySelectorAll('.message:not(#welcomeMessage)');
            messages.forEach(msg => msg.remove());
            if (welcomeMessage) {
                welcomeMessage.style.display = '';
                welcomeMessage.classList.remove('hidden');
            }
            showNotification('Conversation reset');
        }
    } catch (error) {
        console.error('Error resetting conversation:', error);
        showError('تعذر إعادة تعيين المحادثة');
    }
}

// =========================
// UI FUNCTIONS
// =========================
// تحديث ارتفاع التكست اريا تلقائياً
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

async function sendMessage() {
    const message = messageInput.value.trim();

    if (!message || isProcessing) return;
    
    isProcessing = true;
    sendBtn.disabled = true;
    messageInput.disabled = true;
    if (micBtn) micBtn.disabled = true;

    if (welcomeMessage) {
        welcomeMessage.classList.add('hidden');
    }

    if (isListening && recognition) {
        recognition.stop();
    }

    addMessage(message, 'user');
    messageInput.value = '';
    messageInput.style.height = 'auto';
    scrollToBottom();

    try {
        await sendToAI(message);
        thinkingIndicator.style.display = 'none';
    } catch (error) {
        thinkingIndicator.style.display = 'none';
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
        messageInput.disabled = false;
        if (micBtn) micBtn.disabled = false;
        scrollToBottom();
    }
}

function addMessage(text, sender, isMemory = false) {
    const messageDiv = document.createElement('div');

    if (isMemory && sender === 'ai') {
        messageDiv.className = 'message ai memory';
    } else {
        messageDiv.className = `message ${sender}`;
    }

    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    textEl.textContent = text || "";
    messageDiv.appendChild(textEl);

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (sender === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action';
        editBtn.type = 'button';
        editBtn.dataset.action = 'edit';
        editBtn.innerHTML = '<i class="fas fa-pen"></i>';
        actions.appendChild(editBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action';
    copyBtn.type = 'button';
    copyBtn.dataset.action = 'copy';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    actions.appendChild(copyBtn);

    messageDiv.appendChild(actions);

    if (sender === 'ai') {
        messageDiv.style.opacity = '0';
        setTimeout(() => {
            messageDiv.style.opacity = '1';
            messageDiv.style.transition = 'opacity 0.3s ease';
        }, 10);
    }

    chatStream.appendChild(messageDiv);

    if (sender === 'user' && welcomeMessage) {
        welcomeMessage.style.display = 'none';
    }

    chatStream.scrollTop = chatStream.scrollHeight;
    return messageDiv;
}

function scrollToBottom() {
    setTimeout(() => {
        chatStream.scrollTop = chatStream.scrollHeight;
    }, 100);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--primary-accent);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: fadeIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

// =========================
// EVENT LISTENERS
// =========================
sendBtn.addEventListener('click', sendMessage);

if (micBtn) {
    micBtn.addEventListener('click', function() {
        if (!recognition) return;
        
        if (isListening) {
            recognition.stop();
        } else {
            finalTranscript = '';
            messageInput.value = '';
            recognition.start();
        }
    });

    micBtn.addEventListener('dblclick', function() {
        if (!recognition) return;
        
        const currentLang = recognition.lang;
        const newLang = currentLang === 'en-US' ? 'ar-SA' : 'en-US';
        recognition.lang = newLang;
        
        voiceStatus.textContent = `Language changed to: ${newLang === 'en-US' ? 'English' : 'Arabic'}`;
        setTimeout(() => {
            voiceStatus.textContent = '';
        }, 2000);
    });
}

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

if (resetBtn) {
    resetBtn.addEventListener('click', resetConversation);
}

if (quickActions && quickActions.length) {
    quickActions.forEach((btn) => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-prompt') || btn.textContent || '';
            if (!prompt) return;
            messageInput.value = prompt.trim();
            messageInput.focus();
        });
    });
}

function setCaretToEnd(el) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
}

function finalizeEdit(messageDiv, textEl, btn) {
    messageDiv.classList.remove('editing');
    textEl.contentEditable = 'false';
    btn.innerHTML = '<i class="fas fa-pen"></i>';
}

function copyText(text, btn) {
    const done = () => {
        if (!btn) return;
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 900);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {});
        return;
    }

    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(temp);
    done();
}

chatStream.addEventListener('click', (e) => {
    const btn = e.target.closest('.msg-action');
    if (!btn) {
        const msg = e.target.closest('.message');
        if (!msg) return;
        chatStream.querySelectorAll('.message.show-actions').forEach((m) => {
            if (m !== msg) m.classList.remove('show-actions');
        });
        msg.classList.toggle('show-actions');
        return;
    }
    const messageDiv = btn.closest('.message');
    const textEl = messageDiv?.querySelector('.message-text');
    if (!messageDiv || !textEl) return;

    const action = btn.dataset.action;
    if (action === 'copy') {
        copyText(textEl.innerText || '', btn);
    }

    if (action === 'edit') {
        if (!messageDiv.classList.contains('editing')) {
            messageDiv.classList.add('editing');
            textEl.contentEditable = 'true';
            textEl.focus();
            setCaretToEnd(textEl);
            btn.innerHTML = '<i class="fas fa-check"></i>';
        } else {
            finalizeEdit(messageDiv, textEl, btn);
        }
    }
});

chatStream.addEventListener('keydown', (e) => {
    const textEl = e.target.closest('.message-text');
    if (!textEl) return;
    const messageDiv = textEl.closest('.message');
    if (!messageDiv || !messageDiv.classList.contains('editing')) return;
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const btn = messageDiv.querySelector('.msg-action[data-action="edit"]');
        if (btn) finalizeEdit(messageDiv, textEl, btn);
    }
});

chatStream.addEventListener('focusout', (e) => {
    const textEl = e.target.closest('.message-text');
    if (!textEl) return;
    const messageDiv = textEl.closest('.message');
    if (!messageDiv || !messageDiv.classList.contains('editing')) return;
    const btn = messageDiv.querySelector('.msg-action[data-action="edit"]');
    if (btn) finalizeEdit(messageDiv, textEl, btn);
});

