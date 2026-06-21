export async function extractAudioToWav(file: File): Promise<{blob: Blob, durationMs: number}> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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

    return { blob: new Blob([buffer], { type: "audio/wav" }), durationMs: audioBuffer.duration * 1000 };
}

export function getAudioDuration(file: Blob): Promise<number> {
    return new Promise((resolve, reject) => {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        
        audio.onloadedmetadata = () => {
            window.URL.revokeObjectURL(audio.src);
            resolve(audio.duration * 1000); // ms
        };
        
        audio.onerror = () => {
            window.URL.revokeObjectURL(audio.src);
            reject(new Error("Failed to load audio metadata"));
        };
        
        audio.src = URL.createObjectURL(file);
    });
}
