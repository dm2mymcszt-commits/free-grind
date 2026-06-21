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

export function removeVideoTrackFromMp4(arrayBuffer: ArrayBuffer): ArrayBuffer {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const end = arrayBuffer.byteLength;

    interface Box {
        type: string;
        start: number;
        end: number;
        size: number;
        headerSize: number;
        payloadStart: number;
        payloadEnd: number;
    }

    function parseBoxes(start: number, end: number): Box[] {
        const boxes: Box[] = [];
        let pos = start;
        while (pos + 8 <= end) {
            let size = view.getUint32(pos);
            const typeBytes = bytes.slice(pos + 4, pos + 8);
            const type = String.fromCharCode(...typeBytes);
            let headerSize = 8;
            if (size === 1) {
                if (pos + 16 > end) break;
                const high = view.getUint32(pos + 8);
                const low = view.getUint32(pos + 12);
                size = high * 0x100000000 + low;
                headerSize = 16;
            } else if (size === 0) {
                size = end - pos;
            }
            if (size < headerSize || pos + size > end) {
                break;
            }
            boxes.push({
                type,
                start: pos,
                end: pos + size,
                size,
                headerSize,
                payloadStart: pos + headerSize,
                payloadEnd: pos + size
            });
            pos += size;
        }
        return boxes;
    }

    function getHandlerType(trak: Box): string | null {
        const mdiaBoxes = parseBoxes(trak.payloadStart, trak.payloadEnd).filter(b => b.type === "mdia");
        if (mdiaBoxes.length === 0) return null;
        const mdia = mdiaBoxes[0];
        const hdlrBoxes = parseBoxes(mdia.payloadStart, mdia.payloadEnd).filter(b => b.type === "hdlr");
        if (hdlrBoxes.length === 0) return null;
        const hdlr = hdlrBoxes[0];
        if (hdlr.payloadStart + 12 <= hdlr.payloadEnd) {
            const hTypeBytes = bytes.slice(hdlr.payloadStart + 8, hdlr.payloadStart + 12);
            return String.fromCharCode(...hTypeBytes);
        }
        return null;
    }

    const topLevelBoxes = parseBoxes(0, end);
    const moovBoxIndex = topLevelBoxes.findIndex(b => b.type === "moov");
    if (moovBoxIndex === -1) {
        return arrayBuffer;
    }

    const moov = topLevelBoxes[moovBoxIndex];
    const subBoxes = parseBoxes(moov.payloadStart, moov.payloadEnd);
    const newSubBoxBuffers: Uint8Array[] = [];

    for (const sub of subBoxes) {
        if (sub.type === "trak") {
            const hType = getHandlerType(sub);
            if (hType === "vide") {
                continue;
            }
        }
        newSubBoxBuffers.push(bytes.slice(sub.start, sub.end));
    }

    let totalPayloadSize = 0;
    for (const buf of newSubBoxBuffers) {
        totalPayloadSize += buf.byteLength;
    }

    const newMoovBuffer = new Uint8Array(8 + totalPayloadSize);
    const newMoovView = new DataView(newMoovBuffer.buffer);
    
    newMoovView.setUint32(0, 8 + totalPayloadSize);
    newMoovBuffer[4] = "m".charCodeAt(0);
    newMoovBuffer[5] = "o".charCodeAt(0);
    newMoovBuffer[6] = "o".charCodeAt(0);
    newMoovBuffer[7] = "v".charCodeAt(0);

    let offset = 8;
    for (const buf of newSubBoxBuffers) {
        newMoovBuffer.set(buf, offset);
        offset += buf.byteLength;
    }

    let totalFileSize = 0;
    for (let i = 0; i < topLevelBoxes.length; i++) {
        if (i === moovBoxIndex) {
            totalFileSize += newMoovBuffer.byteLength;
        } else {
            totalFileSize += topLevelBoxes[i].size;
        }
    }

    const finalBuffer = new Uint8Array(totalFileSize);
    let writeOffset = 0;
    for (let i = 0; i < topLevelBoxes.length; i++) {
        if (i === moovBoxIndex) {
            finalBuffer.set(newMoovBuffer, writeOffset);
            writeOffset += newMoovBuffer.byteLength;
        } else {
            finalBuffer.set(bytes.slice(topLevelBoxes[i].start, topLevelBoxes[i].end), writeOffset);
            writeOffset += topLevelBoxes[i].size;
        }
    }

    return finalBuffer.buffer;
}

export async function getArrayBufferFromFile(file: Blob): Promise<ArrayBuffer> {
    let url: string | null = null;
    const isVideo = file.type.startsWith("video/") || 
        (file instanceof File && (file.name.endsWith(".mov") || file.name.endsWith(".mp4")));
    try {
        url = URL.createObjectURL(file);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch local object URL");
        let buffer = await res.arrayBuffer();
        if (isVideo) {
            buffer = removeVideoTrackFromMp4(buffer);
        }
        return buffer;
    } catch (e) {
        console.warn("Fetch from object URL failed, falling back to direct arrayBuffer() read:", e);
        let buffer = await file.arrayBuffer();
        if (isVideo) {
            buffer = removeVideoTrackFromMp4(buffer);
        }
        return buffer;
    } finally {
        if (url) {
            URL.revokeObjectURL(url);
        }
    }
}

export async function extractAudioToWav(file: File): Promise<{blob: Blob, durationMs: number, waveform: number[]}> {
    const AudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    // 1 channel, 1 sample length, 44100 sample rate
    const audioContext = new AudioContextClass(1, 1, 44100);
    const arrayBuffer = await getArrayBufferFromFile(file);
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
    const arrayBuffer = await getArrayBufferFromFile(file);
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

