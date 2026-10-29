export type StoryboardRequestRecovery = {
    message: string;
    retryable: boolean;
};

export function getStoryboardRequestRecovery(
    status: number | null,
    retryAfterSeconds?: number | null,
): StoryboardRequestRecovery {
    if (status === null) {
        return {
            message: '네트워크 연결을 확인한 뒤 다시 시도해 주세요. 입력한 내용은 그대로 유지됩니다.',
            retryable: true,
        };
    }
    if (status === 400) return { message: '입력 내용을 확인한 뒤 다시 시도해 주세요.', retryable: false };
    if (status === 401) return { message: '로그인이 만료되었습니다. 다시 로그인한 뒤 이어서 진행해 주세요.', retryable: false };
    if (status === 403) return { message: '이 프로젝트를 수정할 권한이 없습니다.', retryable: false };
    if (status === 404) return { message: '프로젝트 또는 요청 경로를 찾을 수 없습니다. 최신 화면으로 다시 열어 주세요.', retryable: false };
    if (status === 409) return { message: '다른 창의 변경과 충돌했습니다. 최신 버전을 확인한 뒤 다시 저장해 주세요.', retryable: false };
    if (status === 413) return { message: '첨부한 사진 또는 요청 내용이 너무 큽니다. 사진 수나 크기를 줄여 주세요.', retryable: false };
    if (status === 429) {
        return {
            message: retryAfterSeconds && retryAfterSeconds > 0
                ? `${retryAfterSeconds}초 뒤에 다시 시도해 주세요. 요청은 중복 실행되지 않았습니다.`
                : '요청이 잠시 많습니다. 잠시 뒤에 다시 시도해 주세요.',
            retryable: true,
        };
    }
    if (status === 408 || status === 504) return { message: '요청 시간이 초과되었습니다. 잠시 뒤에 다시 시도해 주세요.', retryable: true };
    if (status === 502 || status === 503) return { message: 'AI 서비스가 일시적으로 응답하지 않습니다. 잠시 뒤에 다시 시도해 주세요.', retryable: true };
    if (status >= 500) return { message: '서버에서 요청을 처리하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.', retryable: true };
    return { message: '요청을 완료하지 못했습니다. 입력을 확인한 뒤 다시 시도해 주세요.', retryable: false };
}
