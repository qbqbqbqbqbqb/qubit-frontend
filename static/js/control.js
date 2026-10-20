import { VTuberWebSocket } from './websocket.js';

let botPhase = 'disconnected';
let features = { "twitch": true, "kick": true, "youtube": true, "stt": true, "chat": true, "raid": true, "follow": true, "subs": true, "monologue": true, "vtube_studio": true, "chat_logging": false };
let memoryState = { read: true, write: true };

// Cache DOM Elements
const elements = {
    initBtn: document.getElementById('init-btn'),
    startBtn: document.getElementById('start-btn'),
    pauseBtn: document.getElementById('pause-btn'),
    resumeBtn: document.getElementById('resume-btn'),
    stopBtn: document.getElementById('stop-btn'),
    retryBtn: document.getElementById('retry-btn'),
    status: document.getElementById('status'),
    cmdStatus: document.getElementById('cmd-status'),
    toggles: document.getElementById('toggles'),
    memoryToggles: document.getElementById('memory-toggles'),
    audioList: document.getElementById('audio-list'),
    pngSelect: document.getElementById('png-model-select'),
    pngStatus: document.getElementById('png-status'),
};

// Log Message Handler
function showCmdStatus(msg, isError = false, hideRetry = false) {
    if (!elements.cmdStatus) return;
    elements.cmdStatus.innerText = msg;
    elements.cmdStatus.style.color = isError ? '#c00' : '#666';
    if (elements.retryBtn) elements.retryBtn.style.display = hideRetry ? 'none' : 'inline-block';

    if (msg && !isError) {
        setTimeout(() => { if (elements.cmdStatus.innerText === msg) elements.cmdStatus.innerText = ''; }, 4000);
    }
}

// Update UI Layout based on execution phase
function updateLifecycleButtons(phase) {
    botPhase = phase;
    if (elements.status) elements.status.innerText = phase === 'disconnected' ? 'Disconnected' : `Connected - Phase: ${phase}`;

    const buttons = [elements.initBtn, elements.startBtn, elements.pauseBtn, elements.resumeBtn, elements.stopBtn];
    buttons.forEach(b => { if (b) b.disabled = false; });

    if (phase === 'disconnected') {
        buttons.forEach(b => { if (b) b.disabled = true; });
    } else if (phase === 'ready') {
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.pauseBtn) elements.pauseBtn.disabled = true;
        if (elements.resumeBtn) elements.resumeBtn.disabled = true;
    } else if (phase === 'initialized') {
        if (elements.initBtn) elements.initBtn.disabled = true;
        if (elements.pauseBtn) elements.pauseBtn.disabled = true;
        if (elements.resumeBtn) elements.resumeBtn.disabled = true;
    } else if (phase === 'running') {
        if (elements.initBtn) elements.initBtn.disabled = true;
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.resumeBtn) elements.resumeBtn.disabled = true;
    } else if (phase === 'paused') {
        if (elements.initBtn) elements.initBtn.disabled = true;
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.pauseBtn) elements.pauseBtn.disabled = true;
    }
}

// WS Callback Orchestrator
function handleIncomingMessage(data) {
    if (data.type === 'audio_files') renderAudioList(data.data);
    if (data.type === 'bot_state' && data.data) {
        if (typeof data.data.memory_read === 'boolean') memoryState.read = data.data.memory_read;
        if (typeof data.data.memory_write === 'boolean') memoryState.write = data.data.memory_write;
        updateMemoryToggles();
    }
}

// Instantiate socket engine
const botSocket = new VTuberWebSocket(
    'ws://localhost:8765',
    handleIncomingMessage,
    updateLifecycleButtons,
    showCmdStatus
);

// Render functions
function updateToggles() {
    if (!elements.toggles) return;
    elements.toggles.innerHTML = '';
    Object.entries(features).forEach(([key, value]) => {
        const btn = document.createElement('button');
        btn.innerText = `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value ? 'ON' : 'OFF'}`;
        btn.className = value ? 'toggle-on' : 'toggle-off';
        btn.onclick = () => {
            features[key] = !features[key];
            localStorage.setItem('featureToggles', JSON.stringify(features));
            updateToggles();
        };
        elements.toggles.appendChild(btn);
    });
}

function updateMemoryToggles() {
    const container = elements.memoryToggles;
    if (!container) return;
    container.innerHTML = '';

    const defs = [
        { key: 'read',  label: 'Memory Read',  flag: 'memory_read' },
        { key: 'write', label: 'Memory Write', flag: 'memory_write' },
    ];

    defs.forEach(({ key, label, flag }) => {
        const on = memoryState[key];
        const btn = document.createElement('button');
        btn.innerText = `${label}: ${on ? 'ON' : 'OFF'}`;
        btn.className = on ? 'toggle-on' : 'toggle-off';
        btn.onclick = () => sendMemoryToggle(flag, key);
        container.appendChild(btn);
    });
}

function sendMemoryToggle(flag, stateKey) {
    const newState = !memoryState[stateKey];
    botSocket.send({ action: 'toggle', input: flag, state: newState ? 'on' : 'off' });
    // Optimistic local update — server confirms via the next bot_state broadcast.
    memoryState[stateKey] = newState;
    updateMemoryToggles();
}

function renderAudioList(files) {
    if (!elements.audioList) return;
    elements.audioList.innerHTML = '';
    if (!files || files.length === 0) {
        elements.audioList.innerHTML = '<i>No audio files found.</i>';
        return;
    }
    files.forEach(file => {
        const btn = document.createElement('button');
        btn.innerText = file;
        btn.style.display = 'block';
        btn.style.margin = '4px 0';
        btn.onclick = () => {
            botSocket.send({ action: 'play_audio', file_path: file });
            if (elements.status) elements.status.innerText = `Playing: ${file}`;
        };
        elements.audioList.appendChild(btn);
    });
}

// Fetch model directories from FastAPI backend
async function refreshPngModels() {
    try {
        const res = await fetch('/png/models');
        const data = await res.json();
        const select = elements.pngSelect;

        if (!select) return;
        select.innerHTML = '<option value="">-- Select Model --</option>';

        (data.models || []).forEach(model => {
            const opt = document.createElement('option');
            opt.value = model;
            opt.textContent = model;
            select.appendChild(opt);
        });
        showPngStatus('Models refreshed');
    } catch (e) {
        showPngStatus('Failed to fetch models', true);
    }
}

// Post load_model directly to the PNG command endpoint
// (does not require the bot WebSocket to be connected)
async function loadSelectedModel() {
    const folder = elements.pngSelect?.value;
    if (!folder) {
        showPngStatus('Select a model first', true);
        return;
    }
    try {
        const res = await fetch('/png/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'load_model', folder }),
        });
        if (!res.ok) throw new Error(res.statusText);
        showPngStatus(`Loaded: ${folder}`);
    } catch (e) {
        showPngStatus('Failed to load model', true);
    }
}

async function setPngMode(mode) {
    const action = mode === 'speak' ? 'speak' : 'idle';
    try {
        await fetch('/png/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });
    } catch (e) {
        showPngStatus('Command failed', true);
    }
}

function showPngStatus(msg, isError = false) {
    if (!elements.pngStatus) return;
    elements.pngStatus.innerText = msg;
    elements.pngStatus.style.color = isError ? '#c00' : '#888';
}

// Upload a model folder (4 images picked via file inputs)
async function uploadModel() {
    const nameInput = document.getElementById('upload-model-name');
    const blinkIdle = document.getElementById('upload-blink-idle');
    const blinkSpeaking = document.getElementById('upload-blink-speaking');
    const openIdle = document.getElementById('upload-open-idle');
    const openSpeaking = document.getElementById('upload-open-speaking');

    const name = nameInput?.value?.trim();
    if (!name) { showPngStatus('Enter a model name', true); return; }
    if (!blinkIdle?.files[0] || !blinkSpeaking?.files[0] || !openIdle?.files[0] || !openSpeaking?.files[0]) {
        showPngStatus('Select all 4 images', true);
        return;
    }

    const form = new FormData();
    form.append('folder_name', name);
    form.append('blink_idle', blinkIdle.files[0]);
    form.append('blink_speaking', blinkSpeaking.files[0]);
    form.append('open_idle', openIdle.files[0]);
    form.append('open_speaking', openSpeaking.files[0]);

    try {
        showPngStatus('Uploading...');
        const res = await fetch('/png/models/upload', { method: 'POST', body: form });
        if (!res.ok) throw new Error(res.statusText);
        showPngStatus(`Uploaded "${name}" - click Refresh Models`);
        nameInput.value = '';
        [blinkIdle, blinkSpeaking, openIdle, openSpeaking].forEach(el => { if (el) el.value = ''; });
    } catch (e) {
        showPngStatus('Upload failed', true);
    }
}

// Open the PNG overlay in a popup window sized for OBS browser source
function launchOverlayWindow() {
    window.open('/png/', 'png_overlay', 'width=800,height=600,resizable=yes');
}

// Bind to window so inline HTML onclick handlers can reach them
window.refreshPngModels = refreshPngModels;
window.loadSelectedModel = loadSelectedModel;
window.setPngMode = setPngMode;
window.uploadModel = uploadModel;
window.launchOverlayWindow = launchOverlayWindow;

// Attach lifecycle events
window.doInitialize = () => { botSocket.send({ action: 'initialize' }); updateLifecycleButtons('initialized'); };
window.doStartProcessing = () => botSocket.send({ action: 'start', features });
window.doPause = () => { botSocket.send({ action: 'pause' }); updateLifecycleButtons('paused'); };
window.doResume = () => { botSocket.send({ action: 'resume' }); updateLifecycleButtons('running'); };
window.sendCommand = (action) => botSocket.send({ action });
window.forceReconnect = () => botSocket.forceReconnect();

// Global initializers
(() => {
    const saved = localStorage.getItem('featureToggles');
    if (saved) try { features = { ...features, ...JSON.parse(saved) }; } catch (e) {}

    botSocket.connect();
    updateToggles();
    updateMemoryToggles();
    updateLifecycleButtons('disconnected');
})();
