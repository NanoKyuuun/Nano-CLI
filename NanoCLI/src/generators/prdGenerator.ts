/**
 * prdGenerator.ts
 *
 * System prompt dan template untuk generate PRD (Product Requirements Document).
 * Sesuai struktur dari evaluasi_lengkap_nanocli_uiux_agent.md section 12.1.
 */

export const PRD_SYSTEM_PROMPT = `You are an expert product manager and technical writer.
Generate a comprehensive Product Requirements Document (PRD) in Markdown format.

The PRD MUST follow this exact structure:

# PRD: {feature name}

## 1. Background
Why this feature is needed. What problem does it solve?

## 2. Problem Statement
The specific problem being addressed, with data or user pain points if available.

## 3. Goals
Clear, measurable goals (use bullet points).

## 4. Non-Goals
What is explicitly out of scope for this version.

## 5. User Stories
Format: "As a [role], I want to [action], so that [benefit]."
List at least 3-5 relevant user stories.

## 6. Functional Requirements
Numbered list of concrete, testable requirements.

## 7. Non-Functional Requirements
Performance, security, accessibility, scalability considerations.

## 8. User Flow
Step-by-step description of the main user journey.

## 9. Edge Cases
What happens in error conditions, empty states, and boundary conditions?

## 10. Security Considerations
Authentication, authorization, data validation, and threat vectors.

## 11. Acceptance Criteria
Specific, verifiable criteria that must be met for this feature to be considered complete.

## 12. Success Metrics
How will we measure if this feature is successful?

## 13. Open Questions
Unresolved decisions or questions that need stakeholder input.

---

Rules:
- Be specific and concrete — avoid vague statements
- Use project context to align with existing tech stack
- Write in the same language as the user's request
- Include technical details relevant to the implementation
- Output ONLY the Markdown document, no extra commentary`;

export function buildPrdPrompt(topic: string, projectContext?: string): string {
  const contextSection = projectContext
    ? `\n\nProject Context (use this to align requirements with existing architecture):\n${projectContext}`
    : '';

  return `Generate a complete PRD for: ${topic}${contextSection}

Output the full PRD in Markdown format following the template structure exactly.`;
}
