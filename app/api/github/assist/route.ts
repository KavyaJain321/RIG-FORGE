import { type NextRequest } from 'next/server'
import type { ModelMessage } from 'ai'

import { getTokenFromCookies, verifyToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-helpers'
import { listCommits, listPullRequests, listIssues, isGithubEnabled } from '@/lib/assistant/tools/github'
import { generate } from '@/lib/llm/generate'

// POST /api/github/assist — { repo, view: 'commits'|'prs'|'issues' }
// Forgie summarizes the current repo view (recent activity / PRs / issues).
export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request)
  if (!token) return errorResponse('Authentication required', 401)
  if (!verifyToken(token)) return errorResponse('Invalid or expired session', 401)

  try {
    if (!isGithubEnabled()) return errorResponse('GitHub is not configured', 503)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const repo = String(body.repo ?? '')
    const view = body.view === 'prs' ? 'prs' : body.view === 'issues' ? 'issues' : 'commits'
    if (!repo) return errorResponse('repo is required', 400)

    let block = ''
    let what = ''
    if (view === 'prs') {
      const prs = await listPullRequests({ repo, state: 'open', limit: 30 })
      what = 'open pull requests'
      block = prs.map((p) => `#${p.number} ${p.title} — ${p.authorLogin}${p.draft ? ' (draft)' : ''}`).join('\n') || '(none)'
    } else if (view === 'issues') {
      const issues = await listIssues({ repo, state: 'open', limit: 30 })
      what = 'open issues'
      block = issues.map((i) => `#${i.number} ${i.title} — ${i.authorLogin}${i.assigneeLogin ? ` → ${i.assigneeLogin}` : ''}`).join('\n') || '(none)'
    } else {
      const commits = await listCommits({ repo, limit: 30 })
      what = 'recent commits'
      block = commits.map((c) => `${c.sha} ${c.message} — ${c.authorLogin || c.authorName}`).join('\n') || '(none)'
    }

    const messages: ModelMessage[] = [
      { role: 'system', content: `You are Forgie, summarizing a GitHub repository's ${what} for a teammate. Give a tight 3–5 bullet summary: the themes/areas of work, anything notable (drafts, stalled items, who's active). Be concrete, no preamble.` },
      { role: 'user', content: `Repo: ${repo}\n\n${what}:\n${block}` },
    ]
    const result = await generate(messages)
    return successResponse({ text: (result.text || '').trim(), view })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Forgie could not summarize this', 500)
  }
}
