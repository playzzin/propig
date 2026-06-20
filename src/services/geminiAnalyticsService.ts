// --- Types & Interfaces ---

export interface ChatMessage {
    role: 'user' | 'model' | 'system';
    content: string;
}

export interface AnalyticsDebug {
    rawReportCount: number;
    appliedFilters: string[];
    queryValidation: string[];
}

export interface TeamAggregation {
    teamName: string;
    totalManDay: number;
    workerCount: number;
    totalAmount: number;
    days: number;
    avgDailyManDay: number;
}

export interface SiteAggregation {
    siteName: string;
    totalManDay: number;
    workerCount: number;
    teamCount: number;
    totalAmount: number;
    days: number;
}

export interface WorkerAggregation {
    name: string;
    totalManDay: number;
    workDays: number;
    totalAmount: number;
    salaryModel: string;
    teams: string[];
    sites: string[];
}

export interface DailyAggregation {
    date: string;
    totalManDay: number;
}

export interface SalaryModelAggregation {
    salaryModel: string;
}

export interface WorkerDetail {
    name: string;
    role: string;
    manDay: number;
    unitPrice: number;
    amount: number;
}

export interface DetailRow {
    date: string;
    siteName: string;
    teamName: string;
    workers: WorkerDetail[];
}

export interface AnalyticsQuery {
    startDate?: string;
    endDate?: string;
}

export interface AnalyticsResult {
    analysis: string;
    teamAgg: TeamAggregation[];
    siteAgg: SiteAggregation[];
    workerAgg: WorkerAggregation[];
    dailyAgg: DailyAggregation[];
    salaryModelAgg: SalaryModelAggregation[];
    detailRows: DetailRow[];
    query: AnalyticsQuery;
    debug: AnalyticsDebug;
}

export const EXAMPLE_QUESTIONS = [
    { category: '기본 분석', text: '이번 달 팀별 공수 현황 보여줘' },
    { category: '인원 분석', text: '가장 많이 출근한 작업자 Top 5' },
    { category: '비용 분석', text: '현장별 총 인건비 비교해줘' },
];

// --- Service Implementation ---

export const analyzeWithAI = async (
    query: string,
    _contextData: unknown
): Promise<AnalyticsResult> => {
    // This is a mock implementation or a placeholder for the actual API call logic
    // In a real scenario, this would send `query` and `contextData` to the Gemini API
    // and parse the response into `AnalyticsResult`.

    console.log("Analyzing with AI:", query);

    // Mock response to satisfy the type checker and basic functionality
    return {
        analysis: "AI analysis result placeholder.",
        teamAgg: [],
        siteAgg: [],
        workerAgg: [],
        dailyAgg: [],
        salaryModelAgg: [],
        detailRows: [],
        query: {
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        },
        debug: {
            rawReportCount: 0,
            appliedFilters: [],
            queryValidation: []
        }
    };
};
