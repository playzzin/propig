"use strict";
/**
 * Tool Registry and Execution System
 * Allows agents to use external tools (web search, file ops, API calls)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolRegistry = exports.ToolRegistry = void 0;
const zod_1 = require("zod");
/**
 * Tool Registry manages available tools for agents
 */
class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }
    /**
     * Register a new tool
     */
    registerTool(tool) {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool ${tool.name} is already registered`);
        }
        this.tools.set(tool.name, tool);
    }
    /**
     * Get a tool by name
     */
    getTool(name) {
        return this.tools.get(name);
    }
    /**
     * List all available tools
     */
    listTools(category) {
        const allTools = Array.from(this.tools.values());
        if (category) {
            return allTools.filter(tool => tool.category === category);
        }
        return allTools;
    }
    /**
     * Execute a tool with validation
     */
    async executeTool(toolName, params) {
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
        }
        catch (error) {
            const e = error;
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
    getToolDescriptions() {
        const tools = this.listTools();
        return tools
            .map(tool => `${tool.name} (${tool.category}): ${tool.description}`)
            .join('\n');
    }
}
exports.ToolRegistry = ToolRegistry;
// Create global registry
exports.toolRegistry = new ToolRegistry();
// ============================================
// Built-in Tools
// ============================================
/**
 * Web Search Tool
 */
exports.toolRegistry.registerTool({
    name: 'web_search',
    description: 'Search the web for information using a query',
    category: 'search',
    parameters: zod_1.z.object({
        query: zod_1.z.string().min(1).max(500),
        maxResults: zod_1.z.number().optional().default(5),
    }),
    execute: async (params) => {
        const { query, maxResults } = params;
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
exports.toolRegistry.registerTool({
    name: 'http_request',
    description: 'Make HTTP requests to external APIs',
    category: 'api',
    parameters: zod_1.z.object({
        url: zod_1.z.string().url(),
        method: zod_1.z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
        headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
        body: zod_1.z.unknown().optional(),
    }),
    execute: async (params) => {
        const { url, method, headers, body } = params;
        const response = await fetch(url, {
            method,
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
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
exports.toolRegistry.registerTool({
    name: 'calculator',
    description: 'Perform mathematical calculations',
    category: 'data',
    parameters: zod_1.z.object({
        expression: zod_1.z.string(),
    }),
    execute: async (params) => {
        const { expression } = params;
        // Simple evaluation (be careful with eval in production!)
        // TODO: Use a safer math parser like math.js
        try {
            // Very basic validation
            if (!/^[\d+\-*/().\s]+$/.test(expression)) {
                throw new Error('Invalid expression');
            }
            const result = eval(expression);
            return { expression, result };
        }
        catch (error) {
            throw new Error('Calculation failed: Invalid expression');
        }
    },
});
/**
 * Text Summarization Tool (Placeholder)
 */
exports.toolRegistry.registerTool({
    name: 'summarize_text',
    description: 'Summarize long text into concise format',
    category: 'data',
    parameters: zod_1.z.object({
        text: zod_1.z.string(),
        maxLength: zod_1.z.number().optional().default(200),
    }),
    execute: async (params) => {
        const { text, maxLength } = params;
        // TODO: Integrate with LLM for actual summarization
        // For now, just truncate
        const summary = text.length > maxLength
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
exports.toolRegistry.registerTool({
    name: 'get_current_time',
    description: 'Get the current date and time',
    category: 'system',
    parameters: zod_1.z.object({
        timezone: zod_1.z.string().optional().default('UTC'),
    }),
    execute: async (params) => {
        const { timezone } = params;
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
exports.toolRegistry.registerTool({
    name: 'parse_json',
    description: 'Parse and validate JSON data',
    category: 'data',
    parameters: zod_1.z.object({
        json_string: zod_1.z.string(),
    }),
    execute: async (params) => {
        const { json_string } = params;
        try {
            const parsed = JSON.parse(json_string);
            return {
                success: true,
                data: parsed,
                type: Array.isArray(parsed) ? 'array' : typeof parsed,
            };
        }
        catch (error) {
            const e = error;
            throw new Error(`JSON parsing failed: ${e.message}`);
        }
    },
});
//# sourceMappingURL=ToolRegistry.js.map