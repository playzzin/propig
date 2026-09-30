import { spawn } from 'child_process';

export function resolveFfmpegBinaryPath(
    reportedPath: string | null = null,
): string {
    const configuredPath = process.env.FFMPEG_BIN?.trim();
    if (configuredPath) return configuredPath;

    const bundledPath = reportedPath?.trim();
    if (bundledPath) return bundledPath;

    const runtimeRoot =
        process.env.INIT_CWD?.trim()
        || process.env.npm_config_local_prefix?.trim()
        || process.env.PROJECT_CWD?.trim();
    if (!runtimeRoot) {
        throw new Error(
            'FFmpeg executable was not found. Configure FFMPEG_BIN for this runtime.',
        );
    }
    const separator = process.platform === 'win32' ? '\\' : '/';
    const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    return [
        runtimeRoot.replace(/[\\/]+$/, ''),
        'node_modules',
        'ffmpeg-static',
        executableName,
    ].join(separator);
}

export async function inspectFfmpegRuntime(): Promise<{
    ok: boolean;
    binaryPath: string | null;
    version: string | null;
    message: string;
}> {
    try {
        const binaryPath = resolveFfmpegBinaryPath();
        const output = await new Promise<string>((resolve, reject) => {
            const child = spawn(binaryPath, ['-version'], { windowsHide: true });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            child.on('error', reject);
            child.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout || stderr);
                    return;
                }
                reject(new Error(stderr || `FFmpeg exited with code ${code}`));
            });
        });
        const version = output.split(/\r?\n/).find(Boolean)?.trim() || null;
        return {
            ok: true,
            binaryPath,
            version,
            message: 'FFmpeg is available for frame extraction, audio inspection, and final assembly.',
        };
    } catch (error) {
        return {
            ok: false,
            binaryPath: null,
            version: null,
            message: error instanceof Error ? error.message : 'FFmpeg runtime check failed.',
        };
    }
}
