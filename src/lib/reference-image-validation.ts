export function hasImageSignatureBytes(
    bytes: Uint8Array,
    expected: number[],
    offset = 0,
): boolean {
    return expected.every((value, index) => bytes[offset + index] === value);
}

export function detectReferenceImageMimeType(bytes: Uint8Array): string | null {
    if (hasImageSignatureBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (hasImageSignatureBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
    if (hasImageSignatureBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
    if (
        hasImageSignatureBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        hasImageSignatureBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
    ) {
        return 'image/webp';
    }
    if (!hasImageSignatureBytes(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return null;

    for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
        const brand = String.fromCharCode(...bytes.slice(offset, offset + 4)).toLowerCase();
        if (brand === 'avif' || brand === 'avis') return 'image/avif';
    }
    return null;
}

export async function validateReferenceImageSignature(file: File): Promise<void> {
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const detectedMimeType = detectReferenceImageMimeType(header);
    if (!detectedMimeType || detectedMimeType !== file.type) {
        throw new Error('파일 형식과 실제 이미지 데이터가 일치하지 않습니다. 원본 PNG, JPG, WebP, GIF 또는 AVIF를 선택해 주세요.');
    }
}
