export function generateWaveformFromBuffer(audioBuffer: AudioBuffer, numBars: number = 36): number[] {
    const rawData = audioBuffer.getChannelData(0); // use first channel
    const blockSize = Math.floor(rawData.length / numBars);
    const bars: number[] = [];
    
    for (let i = 0; i < numBars; i++) {
        const start = i * blockSize;
        let sum = 0;
        let peak = 0;
        const end = Math.min(start + blockSize, rawData.length);
        if (start >= rawData.length) {
            bars.push(0.1);
            continue;
        }
        for (let j = start; j < end; j++) {
            const val = Math.abs(rawData[j]);
            if (val > peak) peak = val;
            sum += val * val;
        }
        // Use a mix of RMS and peak, normalized, and ensure a minimum height
        const rms = Math.sqrt(sum / Math.max(1, end - start));
        const val = 0.2 * rms + 0.8 * peak;
        bars.push(Math.max(0.08, Math.min(1, val)));
    }
    return bars;
}

export async function extractAudioToWav(file: File): Promise<{blob: Blob, durationMs: number, waveform: number[]}> {
    const AudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    // 1 channel, 1 sample length, 44100 sample rate
    const audioContext = new AudioContextClass(1, 1, 44100);
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        try {
            const promise = audioContext.decodeAudioData(
                arrayBuffer,
                (buffer) => resolve(buffer),
                (err) => reject(err || new Error("Failed to decode audio data"))
            );
            if (promise && typeof promise.catch === "function") {
                promise.catch((err) => reject(err));
            }
        } catch (e) {
            reject(e);
        }
    });
    
    const numOfChan = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };
    const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
    const writeString = (s: string) => { for (let i = 0; i < s.length; i++) { view.setUint8(pos++, s.charCodeAt(i)); } };

    writeString('RIFF');
    setUint32(length - 8);
    writeString('WAVE');
    writeString('fmt ');
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    writeString('data');
    setUint32(length - pos - 4);

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    const waveform = generateWaveformFromBuffer(audioBuffer, 36);
    return { 
        blob: new Blob([buffer], { type: "audio/wav" }), 
        durationMs: audioBuffer.duration * 1000,
        waveform
    };
}

export async function getAudioFileMetadata(file: Blob): Promise<{ durationMs: number; waveform: number[] }> {
    const AudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const audioContext = new AudioContextClass(1, 1, 44100);
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        try {
            const promise = audioContext.decodeAudioData(
                arrayBuffer,
                (buffer) => resolve(buffer),
                (err) => reject(err || new Error("Failed to decode audio data"))
            );
            if (promise && typeof promise.catch === "function") {
                promise.catch((err) => reject(err));
            }
        } catch (e) {
            reject(e);
        }
    });

    const waveform = generateWaveformFromBuffer(audioBuffer, 36);
    return {
        durationMs: audioBuffer.duration * 1000,
        waveform
    };
}
