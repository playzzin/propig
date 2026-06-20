import * as fs from 'fs';
import * as path from 'path';

/**
 * Skill Definition
 */
export interface SkillDefinition {
    name: string;
    description: string;
    version: string;
    triggers: string[];
    instructions: string;
    filePath: string;
}

/**
 * Skill Match Result
 */
export interface SkillMatch {
    skill: SkillDefinition;
    score: number;
}

/**
 * SkillsLoader
 * 
 * 스킬 디렉토리에서 SKILL.md 파일을 파싱하고 로드합니다.
 * 사용자 입력과 트리거를 매칭하여 적절한 스킬을 찾습니다.
 */
export class SkillsLoader {
    private skills: Map<string, SkillDefinition> = new Map();
    private skillsDir: string;

    constructor(skillsDir?: string) {
        this.skillsDir = skillsDir || path.join(__dirname, 'skills');
    }

    /**
     * Load all skills from the skills directory
     */
    async loadAllSkills(): Promise<void> {
        try {
            if (!fs.existsSync(this.skillsDir)) {
                console.log(`[SkillsLoader] Skills directory not found: ${this.skillsDir}`);
                return;
            }

            const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillPath = path.join(this.skillsDir, entry.name, 'SKILL.md');
                    if (fs.existsSync(skillPath)) {
                        const skill = await this.parseSkillFile(skillPath);
                        if (skill) {
                            this.skills.set(skill.name, skill);
                            console.log(`[SkillsLoader] Loaded skill: ${skill.name}`);
                        }
                    }
                }
            }

            console.log(`[SkillsLoader] Loaded ${this.skills.size} skills`);
        } catch (error) {
            console.error('[SkillsLoader] Error loading skills:', error);
        }
    }

    /**
     * Parse a SKILL.md file
     */
    private async parseSkillFile(filePath: string): Promise<SkillDefinition | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');

            // Parse YAML frontmatter
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!frontmatterMatch) {
                console.warn(`[SkillsLoader] No frontmatter in ${filePath}`);
                return null;
            }

            const frontmatter = frontmatterMatch[1];
            const instructions = content.slice(frontmatterMatch[0].length).trim();

            // Simple YAML parsing
            const name = this.extractYamlValue(frontmatter, 'name');
            const description = this.extractYamlValue(frontmatter, 'description');
            const version = this.extractYamlValue(frontmatter, 'version') || '1.0.0';
            const triggersRaw = this.extractYamlArray(frontmatter, 'triggers');

            if (!name) {
                console.warn(`[SkillsLoader] Missing name in ${filePath}`);
                return null;
            }

            return {
                name,
                description: description || '',
                version,
                triggers: triggersRaw,
                instructions,
                filePath,
            };
        } catch (error) {
            console.error(`[SkillsLoader] Error parsing ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Extract a simple YAML value
     */
    private extractYamlValue(yaml: string, key: string): string | null {
        const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
        return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
    }

    /**
     * Extract YAML array
     */
    private extractYamlArray(yaml: string, key: string): string[] {
        const lines = yaml.split('\n');
        const result: string[] = [];
        let inArray = false;

        for (const line of lines) {
            if (line.startsWith(`${key}:`)) {
                inArray = true;
                continue;
            }
            if (inArray) {
                if (line.startsWith('  -') || line.startsWith('  - ')) {
                    result.push(line.replace(/^\s+-\s*["']?|["']?\s*$/g, '').trim());
                } else if (!line.startsWith(' ')) {
                    break;
                }
            }
        }

        return result;
    }

    /**
     * Find matching skills for user input
     */
    findMatchingSkills(userInput: string, limit: number = 3): SkillMatch[] {
        const input = userInput.toLowerCase();
        const matches: SkillMatch[] = [];

        for (const skill of this.skills.values()) {
            let score = 0;
            let matchCount = 0;

            for (const trigger of skill.triggers) {
                if (input.includes(trigger.toLowerCase())) {
                    matchCount++;
                }
            }

            if (matchCount > 0) {
                score = matchCount / skill.triggers.length;
                matches.push({ skill, score });
            }
        }

        // Sort by score descending
        matches.sort((a, b) => b.score - a.score);

        return matches.slice(0, limit);
    }

    /**
     * Get a skill by name
     */
    getSkill(name: string): SkillDefinition | undefined {
        return this.skills.get(name);
    }

    /**
     * Get all loaded skills
     */
    getAllSkills(): SkillDefinition[] {
        return Array.from(this.skills.values());
    }
}

// Singleton instance
let loaderInstance: SkillsLoader | null = null;

export function getSkillsLoader(skillsDir?: string): SkillsLoader {
    if (!loaderInstance) {
        loaderInstance = new SkillsLoader(skillsDir);
    }
    return loaderInstance;
}
