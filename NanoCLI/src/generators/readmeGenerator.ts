/**
 * readmeGenerator.ts
 *
 * System prompt dan template untuk generate README.
 * Sesuai struktur dari evaluasi_lengkap_nanocli_uiux_agent.md section 12.4.
 * Project-aware: membaca package.json, tsconfig.json, dll.
 */

export const README_SYSTEM_PROMPT = `You are a technical writer and senior engineer.
Generate a professional README.md for the project based on the provided project information.

The README MUST follow this exact structure:

# {Project Name}

> One-line description of what this project does.

## Overview
2-3 paragraph explanation of the project's purpose, target users, and value proposition.

## Features
Bullet list of key features.

## Tech Stack
List the main technologies, frameworks, and libraries used.

## Prerequisites
What needs to be installed before running the project.

## Installation
Step-by-step installation instructions with code blocks.

## Environment Variables
Table of all environment variables with descriptions and whether they're required.
| Variable | Description | Required | Default |
|---|---|---|---|

## Development
How to run the project locally, including dev server commands.

## Testing
How to run tests.

## Build
How to build for production.

## Project Structure
Brief description of the folder structure.
\`\`\`
src/
  key-folder/   — description
  ...
\`\`\`

## Usage
Examples of how to use the project/CLI/API.

## Contributing
Brief contribution guidelines.

## License
License information.

---

Rules:
- Use actual project information from the context provided
- Include real command examples that work for this project
- Write in a professional but approachable tone
- Match the language of the project's existing documentation
- Output ONLY the Markdown document, no extra commentary`;

export function buildReadmePrompt(projectContext?: string, packageJson?: string): string {
  const parts: string[] = ['Generate a complete README.md for this project.'];

  if (packageJson) {
    parts.push(`\n\npackage.json contents:\n\`\`\`json\n${packageJson}\n\`\`\``);
  }

  if (projectContext) {
    parts.push(`\n\nProject Context (existing docs and architecture):\n${projectContext}`);
  }

  parts.push('\n\nOutput the full README in Markdown format following the template structure.');
  return parts.join('');
}

export function buildApiSpecPrompt(topic: string, projectContext?: string): string {
  const contextSection = projectContext
    ? `\n\nProject Context:\n${projectContext}`
    : '';

  return `Generate a complete API Specification document for: ${topic}${contextSection}

Include:
- Endpoint definitions with HTTP method, path, request/response schemas
- Authentication requirements
- Error codes and responses
- Example requests and responses
- Rate limiting and pagination info if applicable

Output as Markdown with JSON examples in code blocks.`;
}
