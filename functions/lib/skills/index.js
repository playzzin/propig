"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillsLoader = void 0;
exports.getSkillsLoader = getSkillsLoader;
const fs = require("fs");
const path = require("path");
/**
 * SkillsLoader
 *
 * 스킬 디렉토리에서 SKILL.md 파일을 파싱하고 로드합니다.
 * 사용자 입력과 트리거를 매칭하여 적절한 스킬을 찾습니다.
 */
class SkillsLoader {
    constructor(skillsDir) {
        this.skills = new Map();
        this.skillsDir = skillsDir || path.join(__dirname, 'skills');
    }
    /**
     * Load all skills from the skills directory
     */
    async loadAllSkills() {
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
        }
        catch (error) {
            console.error('[SkillsLoader] Error loading skills:', error);
        }
    }
    /**
     * Parse a SKILL.md file
     */
    async parseSkillFile(filePath) {
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
        }
        catch (error) {
            console.error(`[SkillsLoader] Error parsing ${filePath}:`, error);
            return null;
        }
    }
    /**
     * Extract a simple YAML value
     */
    extractYamlValue(yaml, key) {
        const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
        return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
    }
    /**
     * Extract YAML array
     */
    extractYamlArray(yaml, key) {
        const lines = yaml.split('\n');
        const result = [];
        let inArray = false;
        for (const line of lines) {
            if (line.startsWith(`${key}:`)) {
                inArray = true;
                continue;
            }
            if (inArray) {
                if (line.startsWith('  -') || line.startsWith('  - ')) {
                    result.push(line.replace(/^\s+-\s*["']?|["']?\s*$/g, '').trim());
                }
                else if (!line.startsWith(' ')) {
                    break;
                }
            }
        }
        return result;
    }
    /**
     * Find matching skills for user input
     */
    findMatchingSkills(userInput, limit = 3) {
        const input = userInput.toLowerCase();
        const matches = [];
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
    getSkill(name) {
        return this.skills.get(name);
    }
    /**
     * Get all loaded skills
     */
    getAllSkills() {
        return Array.from(this.skills.values());
    }
}
exports.SkillsLoader = SkillsLoader;
// Singleton instance
let loaderInstance = null;
function getSkillsLoader(skillsDir) {
    if (!loaderInstance) {
        loaderInstance = new SkillsLoader(skillsDir);
    }
    return loaderInstance;
}
//# sourceMappingURL=index.js.map