export function createDownloadFileName(
    name: string,
    extension: string,
    fallback = 'generated-asset',
): string {
    const safeBase = name
        .normalize('NFKC')
        .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 96) || fallback;
    const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'bin';
    return `${safeBase}.${safeExtension}`;
}

function triggerBrowserDownload(url: string, fileName: string): void {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

export async function downloadRemoteMedia(url: string, fileName: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`다운로드 파일을 불러오지 못했습니다. (${response.status})`);
    }

    const blob = await response.blob();
    if (!blob.size) {
        throw new Error('다운로드할 파일이 비어 있습니다.');
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
        triggerBrowserDownload(objectUrl, fileName);
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
}

export function openRemoteMedia(url: string): void {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
