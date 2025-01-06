// JavaScript (app.js)
import { API_KEY } from './config.js';

let audioContext;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let lastTranscription = "";
let finalTranscription = "";
let currentSentenceId = 0; // 문장 ID
let finalSentences = new Set();
const VOLUME_THRESHOLD = 0.01;

function float32ToWav(buffer, sampleRate) {
    const wavHeader = new ArrayBuffer(44 + buffer.length * 2);
    const view = new DataView(wavHeader);

    function writeString(offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, buffer.length * 2, true);

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        let sample = Math.max(-1, Math.min(1, buffer[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}

function getVolume(audioData) {
    const sum = audioData.reduce((acc, val) => acc + val * val, 0);
    return Math.sqrt(sum / audioData.length);
}

export async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const input = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    audioChunks = [];
    isRecording = true;
    finalTranscription = "";
    currentSentenceId += 1;

    processor.onaudioprocess = async (event) => {
        if (!isRecording) return;
        const audioData = event.inputBuffer.getChannelData(0);
        const volume = getVolume(audioData);

        if (volume < VOLUME_THRESHOLD) {
            if (audioChunks.length > 0) {  // 볼륨이 낮아진 경우 리셋
                const audioBlob = float32ToWav(audioChunks, audioContext.sampleRate);
                audioChunks = [];  // 오디오 청크 초기화

                const formData = new FormData();
                formData.append('file', audioBlob);
                formData.append('model', 'whisper-1');

                const sentenceId = currentSentenceId;

                try {
                    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${API_KEY}`
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        throw new Error(`Error: ${response.statusText}`);
                    }

                    const result = await response.json();

                    if (!finalSentences.has(sentenceId)) {
                        finalSentences.add(sentenceId);
                        finalTranscription += (finalTranscription ? ' ' : '') + result.text;
                        document.getElementById('transcript').innerText = finalTranscription;
                        currentSentenceId++;  
                    }
                } catch (error) {
                    console.error('Error during transcription:', error);
                }
            }
            return;
        }

        audioChunks.push(...audioData);
    };

    input.connect(processor);
    processor.connect(audioContext.destination);
}

export function stopRecording() {
    if (audioContext) {
        isRecording = false;
        audioContext.close();
    }
}

export function runDebug() {
    console.log('Final Transcription:', finalTranscription);
    console.log('Current Sentence ID:', currentSentenceId);
    console.log('Final Sentences:', Array.from(finalSentences));
}