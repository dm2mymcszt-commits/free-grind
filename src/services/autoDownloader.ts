import { exists, mkdir, writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriRuntime } from "./tauriWebSocket";
import { getMessageImageUrl, getMessageVideoUrl, getMessageAudioUrl, getMessageAlbumId } from "../pages/app/chat/chatUtils";
import type { UiMessage } from "../types/chat-page";
import { appLog } from '../utils/logger';
import toast from 'react-hot-toast';

const downloadedSet = new Set<string>();

function getBaseDirectory(): BaseDirectory {
    const dir = window.localStorage.getItem("fg-download-base-dir") || "Download";
    switch (dir) {
        case "Picture": return BaseDirectory.Picture;
        case "Document": return BaseDirectory.Document;
        case "Video": return BaseDirectory.Video;
        case "Desktop": return BaseDirectory.Desktop;
        default: return BaseDirectory.Download;
    }
}

export async function processAutoDownload(
    message: UiMessage,
    profileName: string,
    profileId: string,
    service: any 
) {
    if (!isTauriRuntime()) return;
    if (downloadedSet.has(message.messageId)) return;

    const isEnabled = window.localStorage.getItem("fg-auto-download-media") === "true";
    if (!isEnabled) return;

    const urlsToDownload: string[] = [];

    const imageUrl = getMessageImageUrl(message);
    const videoUrl = getMessageVideoUrl(message);
    const audioUrl = getMessageAudioUrl(message);
    
    if (imageUrl) urlsToDownload.push(imageUrl);
    if (videoUrl) urlsToDownload.push(videoUrl);
    if (audioUrl) urlsToDownload.push(audioUrl);

    const albumId = getMessageAlbumId(message);
    if (albumId) {
        try {
            const albumDetails = await service.getAlbum(albumId);
            if (albumDetails && albumDetails.content) {
                for (const item of albumDetails.content) {
                    const mediaUrl = item.url || item.thumbUrl || item.coverUrl;
                    if (mediaUrl) urlsToDownload.push(mediaUrl);
                }
            }
        } catch (e) {
            appLog.error("[AutoDownloader] Failed to unlock album for download", e);
        }
    }

    if (urlsToDownload.length === 0) return;
    
    downloadedSet.add(message.messageId);

    const safeName = profileName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const targetDir = getBaseDirectory();
    
    let successCount = 0;

    for (let i = 0; i < urlsToDownload.length; i++) {
        const mediaUrl = urlsToDownload[i];
        
        try {
            // CORS Bypass via Tauri Native HTTP
            const response = await tauriFetch(mediaUrl, { method: "GET" });
            
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            let ext = "jpg";
            if (mediaUrl.includes(".mp4") || videoUrl) ext = "mp4";
            if (mediaUrl.includes(".m4a") || audioUrl) ext = "m4a";

            const fileName = `msg_${message.timestamp}_${i}.${ext}`;

            try {
                const baseFolder = "FreeGrind_Media";
                const hasBase = await exists(baseFolder, { baseDir: targetDir });
                if (!hasBase) await mkdir(baseFolder, { baseDir: targetDir });

                const profileFolder = baseFolder + "/" + `${safeName}_${profileId}`;
                const hasProfile = await exists(profileFolder, { baseDir: targetDir });
                if (!hasProfile) await mkdir(profileFolder, { baseDir: targetDir });

                const filePath = profileFolder + "/" + fileName;
                await writeFile(filePath, uint8Array, { baseDir: targetDir });
                
                successCount++;
            } catch (fsError) {
                appLog.error("[AutoDownloader] Native FS blocked by Tauri permissions:", fsError);
                toast.error("Auto-Download Blocked: Missing Tauri OS Permissions.");
                break; 
            }

        } catch (error) {
            appLog.error(`[AutoDownloader] Failed to fetch media`, error);
        }
    }

    if (successCount > 0) {
        toast.success(`Auto-Saved ${successCount} media file(s) to FreeGrind_Media folder`, {
            icon: '⬇️',
            style: { background: '#10b981', color: '#fff' }
        });
    }
}