/**
 * Tool Registry and Execution System
 * Allows agents to use external tools (web search, file ops, API calls)
 */

import { z } from 'zod';

export interface Tool {
    name: string;
    description: string;
    parameters: z.ZodSchema;
    execute: (params: unknown) => Promise<unknown>;
    category: 'search' | 'file' | 'api' | 'data' | 'system';
}

export interface ToolExecutionResult {
    success: boolean;
    data?: unknown;
    error?: string;
    executionTime: number;
}

/**
 * Tool Registry manages available tools for agents
 */
export class ToolRegistry {
    private tools = new Map<string, Tool>();

    /**
     * Register a new tool
     */
    registerTool(tool: Tool): void {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool ${tool.name} is already registered`);
        }
        this.tools.set(tool.name, tool);
    }

    /**
     * Get a tool by name
     */
    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * List all available tools
     */
    listTools(category?: Tool['category']): Tool[] {
        const allTools = Array.from(this.tools.values());
        if (category) {
            return allTools.filter(tool => tool.category === category);
        }
        return allTools;
    }

    /**
     * Execute a tool with validation
     */
    async executeTool(toolName: string, params: unknown): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        const tool = this.getTool(toolName);

        if (!tool) {
            return {
                success: false,
                error: `Tool ${toolName} not found`,
                executionTime: Date.now() - startTime,
            };
        }

        try {
            // Validate parameters
            const validatedParams = tool.parameters.parse(params);

            // Execute tool
            const data = await tool.execute(validatedParams);

            return {
                success: true,
                data,
                executionTime: Date.now() - startTime,
            };
        } catch (error) {
            const e = error as Error;
            return {
                success: false,
                error: e.message,
                executionTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Get tool descriptions for LLM
     */
    getToolDescriptions(): string {
        const tools = this.listTools();
        return tools
            .map(
                tool =>
                    `${tool.name} (${tool.category}): ${tool.description}`
            )
            .join('\n');
    }
}

// Create global registry
export const toolRegistry = new ToolRegistry();

// ============================================
// Built-in Tools
// ============================================

/**
 * Web Search Tool
 */
toolRegistry.registerTool({
    name: 'web_search',
    description: 'Search the web for information using a query',
    category: 'search',
    parameters: z.object({
        query: z.string().min(1).max(500),
        maxResults: z.number().optional().default(5),
    }),
    execute: async (params) => {
        const { query, maxResults } = params as { query: string; maxResults: number };

        // TODO: Integrate with actual search API (Google, Bing, etc.)
        // For now, return mock data
        return {
            query,
            results: [
                {
                    title: 'Search Result 1',
                    url: 'https://example.com/1',
                    snippet: 'This is a placeholder search result',
                },
                {
                    title: 'Search Result 2',
                    url: 'https://example.com/2',
                    snippet: 'Integrate with real search API for production',
                },
            ].slice(0, maxResults),
        };
    },
});

/**
 * HTTP Request Tool
 */
toolRegistry.registerTool({
    name: 'http_request',
    description: 'Make HTTP requests to external APIs',
    category: 'api',
    parameters: z.object({
        url: z.string().url(),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.unknown().optional(),
    }),
    execute: async (params) => {
        const { url, method, headers, body } = params as {
            url: string;
            method: string;
            headers?: Record<string, string>;
            body?: unknown;
        };

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const data = await response.json();

        return {
            status: response.status,
            statusText: response.statusText,
            data,
        };
    },
});

/**
 * Calculator Tool
 */
toolRegistry.registerTool({
    name: 'calculator',
    description: 'Perform mathematical calculations',
    category: 'data',
    parameters: z.object({
        expression: z.string(),
    }),
    execute: async (params) => {
        const { expression } = params as { expression: string };

        // Simple evaluation (be careful with eval in production!)
        // TODO: Use a safer math parser like math.js
        try {
            // Very basic validation
            if (!/^[\d+\-*/().\s]+$/.test(expression)) {
                throw new Error('Invalid expression');
            }

            const result = eval(expression);
            return { expression, result };
        } catch {
            throw new Error('Calculation failed: Invalid expression');
        }
    },
});

/**
 * Text Summarization Tool (Placeholder)
 */
toolRegistry.registerTool({
    name: 'summarize_text',
    description: 'Summarize long text into concise format',
    category: 'data',
    parameters: z.object({
        text: z.string(),
        maxLength: z.number().optional().default(200),
    }),
    execute: async (params) => {
        const { text, maxLength } = params as { text: string; maxLength: number };

        // TODO: Integrate with LLM for actual summarization
        // For now, just truncate
        const summary =
            text.length > maxLength
                ? text.substring(0, maxLength) + '...'
                : text;

        return {
            original_length: text.length,
            summary_length: summary.length,
            summary,
        };
    },
});

/**
 * Current Time Tool
 */
toolRegistry.registerTool({
    name: 'get_current_time',
    description: 'Get the current date and time',
    category: 'system',
    parameters: z.object({
        timezone: z.string().optional().default('UTC'),
    }),
    execute: async (params) => {
        const { timezone } = params as { timezone: string };

        const now = new Date();
        return {
            timestamp: now.getTime(),
            iso: now.toISOString(),
            timezone,
            formatted: now.toLocaleString('en-US', { timeZone: timezone }),
        };
    },
});

/**
 * JSON Parser Tool
 */
toolRegistry.registerTool({
    name: 'parse_json',
    description: 'Parse and validate JSON data',
    category: 'data',
    parameters: z.object({
        json_string: z.string(),
    }),
    execute: async (params) => {
        const { json_string } = params as { json_string: string };

        try {
            const parsed = JSON.parse(json_string);
            return {
                success: true,
                data: parsed,
                type: Array.isArray(parsed) ? 'array' : typeof parsed,
            };
        } catch (error) {
            const e = error as Error;
            throw new Error(`JSON parsing failed: ${e.message}`);
        }
    },
});
