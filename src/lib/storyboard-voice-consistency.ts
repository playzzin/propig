import type {
    StoryboardVideoProduction,
    StoryboardVideoScene,
    StoryboardVoiceProfile,
} from '@/schemas/imageStoryboard';

const DEFAULT_SPEAKING_STYLE = '자연스러운 한국어 발음과 호흡, 감정이 달라져도 같은 음색 유지';

export type ResolvedStoryboardVoiceProfile = {
    characterName: string;
    identityKey: string;
    speakingStyle: string;
    voiceDescription: string;
};

export function createStoryboardVoiceProfile(
    profileCount: number,
    fallbackVoiceDirection: string,
): StoryboardVoiceProfile {
    const id = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return {
        id,
        characterName: `캐릭터 ${profileCount + 1}`,
        voiceDescription: fallbackVoiceDirection.trim() || '자연스러운 한국어 목소리',
        speakingStyle: DEFAULT_SPEAKING_STYLE,
    };
}

export function resolveStoryboardVoiceProfile(
    videoProduction: Pick<StoryboardVideoProduction, 'voiceDirection' | 'voiceProfiles'>,
    sceneVideo: Pick<StoryboardVideoScene, 'voiceProfileId'>,
): ResolvedStoryboardVoiceProfile | null {
    const profiles = videoProduction.voiceProfiles;
    const selectedProfile = sceneVideo.voiceProfileId
        ? profiles.find((profile) => profile.id === sceneVideo.voiceProfileId)
        : profiles.length === 1
            ? profiles[0]
            : undefined;

    if (selectedProfile) {
        return {
            identityKey: `character-${selectedProfile.id}`,
            characterName: selectedProfile.characterName.trim(),
            voiceDescription: selectedProfile.voiceDescription.trim(),
            speakingStyle: selectedProfile.speakingStyle.trim() || DEFAULT_SPEAKING_STYLE,
        };
    }

    const fallbackDirection = videoProduction.voiceDirection.trim();
    if (!fallbackDirection) return null;

    return {
        identityKey: 'project-default-speaker',
        characterName: '현재 장면의 화면 속 화자',
        voiceDescription: fallbackDirection,
        speakingStyle: DEFAULT_SPEAKING_STYLE,
    };
}

export function buildStoryboardVoiceLock(
    profile: ResolvedStoryboardVoiceProfile | null,
): string | null {
    if (!profile) return null;

    return [
        `Immutable character voice identity [${profile.identityKey}].`,
        `The only speaker is ${profile.characterName}.`,
        `Core vocal identity: ${profile.voiceDescription}.`,
        `Speaking style: ${profile.speakingStyle}.`,
        'Reuse this exact speaker identity in every scene assigned to this character. Keep the same apparent voice actor, age range, vocal timbre, pitch register, accent, pronunciation, cadence, and breath texture even when emotion or volume changes.',
        'Do not substitute another voice, drift toward a narrator voice, change gender or age presentation, add a second speaker, or imitate the voice of a different character.',
    ].join('\n');
}

export function hasAmbiguousStoryboardVoiceSelection(
    videoProduction: Pick<StoryboardVideoProduction, 'voiceProfiles'>,
    sceneVideo: Pick<StoryboardVideoScene, 'voiceProfileId'>,
): boolean {
    if (videoProduction.voiceProfiles.length <= 1) return false;
    return !videoProduction.voiceProfiles.some(
        (profile) => profile.id === sceneVideo.voiceProfileId,
    );
}
