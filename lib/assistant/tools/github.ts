/**
 * GitHub integration for Forgie.
 *
 * Direct REST API integration (no MCP server). Auth is a single
 * fine-grained Personal Access Token in env (GITHUB_TOKEN) with org
 * (GITHUB_ORG) for the default scope.
 *
 * Read tools auto-execute. Write tools (createRepo, createIssue) are
 * called only from /api/assistant/actions/execute, after the user
 * taps Confirm on a propose card.
 *
 * All requests use the modern Authorization: Bearer header + the
 * 2022-11-28 API version pin.
 */

const GITHUB_API = 'https://api.github.com'
const API_VERSION = '2022-11-28'

// ─── Low-level fetch wrapper ─────────────────────────────────────────────────

function getEnv(): { token: string; org: string } | null {
  const token = process.env.GITHUB_TOKEN
  const org = process.env.GITHUB_ORG
  if (!token || !org) return null
  return { token, org }
}

export function isGithubEnabled(): boolean {
  return getEnv() !== null
}

interface GhFetchInit extends RequestInit {
  /** When true, swallow 404 as null. Default false. */
  allow404?: boolean
}

async function gh<T>(path: string, init: GhFetchInit = {}): Promise<T> {
  const env = getEnv()
  if (!env) {
    throw new Error('GitHub is not configured (set GITHUB_TOKEN and GITHUB_ORG).')
  }
  const { allow404, ...rest } = init
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${env.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'rig-forge-forgie/1.0',
      ...(rest.body && { 'Content-Type': 'application/json' }),
      ...rest.headers,
    },
  })
  if (allow404 && res.status === 404) {
    return null as T
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 240)}`)
  }
  return res.json() as Promise<T>
}

function org(): string {
  return getEnv()?.org ?? ''
}

// ─── Tool: list_repos ────────────────────────────────────────────────────────

export interface ListReposArgs {
  /** Filter by status. Default 'all'. */
  type?: 'all' | 'public' | 'private' | 'forks' | 'sources' | 'member'
  /** Sort. Default 'updated'. */
  sort?: 'created' | 'updated' | 'pushed' | 'full_name'
  limit?: number
}

export async function listRepos(args: ListReposArgs = {}) {
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100)
  const params = new URLSearchParams({
    type: args.type ?? 'all',
    sort: args.sort ?? 'updated',
    per_page: String(limit),
  })
  const repos = await gh<Array<{
    name: string
    full_name: string
    description: string | null
    html_url: string
    private: boolean
    archived: boolean
    fork: boolean
    language: string | null
    pushed_at: string
    updated_at: string
    open_issues_count: number
    default_branch: string
  }>>(`/orgs/${org()}/repos?${params}`)

  return repos.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    url: r.html_url,
    private: r.private,
    archived: r.archived,
    isFork: r.fork,
    language: r.language,
    defaultBranch: r.default_branch,
    openIssues: r.open_issues_count,
    pushedAt: r.pushed_at,
  }))
}

// ─── Tool: get_repo ──────────────────────────────────────────────────────────

export async function getRepo(repoName: string) {
  const repo = await gh<{
    name: string
    full_name: string
    description: string | null
    html_url: string
    private: boolean
    archived: boolean
    language: string | null
    pushed_at: string
    open_issues_count: number
    stargazers_count: number
    watchers_count: number
    forks_count: number
    default_branch: string
    topics: string[]
  } | null>(`/repos/${org()}/${repoName}`, { allow404: true })

  if (!repo) return null

  return {
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    private: repo.private,
    archived: repo.archived,
    language: repo.language,
    pushedAt: repo.pushed_at,
    openIssues: repo.open_issues_count,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    defaultBranch: repo.default_branch,
    topics: repo.topics ?? [],
  }
}

// ─── Tool: list_commits ──────────────────────────────────────────────────────

export interface ListCommitsArgs {
  repo: string
  /** GitHub username or email of the author */
  author?: string
  /** ISO date string lower bound */
  since?: string
  /** ISO date string upper bound */
  until?: string
  branch?: string
  limit?: number
}

export async function listCommits(args: ListCommitsArgs) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const params = new URLSearchParams({ per_page: String(limit) })
  if (args.author) params.set('author', args.author)
  if (args.since) params.set('since', args.since)
  if (args.until) params.set('until', args.until)
  if (args.branch) params.set('sha', args.branch)

  const commits = await gh<Array<{
    sha: string
    html_url: string
    commit: {
      message: string
      author: { name: string; email: string; date: string }
    }
    author: { login: string; avatar_url: string } | null
  }>>(`/repos/${org()}/${args.repo}/commits?${params}`, { allow404: true })

  if (!commits) return []

  return commits.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split('\n')[0] ?? c.commit.message,  // first line only
    authorLogin: c.author?.login ?? null,
    authorName: c.commit.author.name,
    date: c.commit.author.date,
    url: c.html_url,
  }))
}

// ─── Tool: list_pull_requests ────────────────────────────────────────────────

export interface ListPullRequestsArgs {
  repo: string
  state?: 'open' | 'closed' | 'all'
  /** GitHub username */
  author?: string
  limit?: number
}

export async function listPullRequests(args: ListPullRequestsArgs) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const params = new URLSearchParams({
    state: args.state ?? 'open',
    sort: 'updated',
    direction: 'desc',
    per_page: String(limit),
  })

  const prs = await gh<Array<{
    number: number
    title: string
    state: string
    html_url: string
    user: { login: string; avatar_url: string }
    created_at: string
    updated_at: string
    merged_at: string | null
    draft: boolean
    requested_reviewers: Array<{ login: string }>
    labels: Array<{ name: string }>
  }>>(`/repos/${org()}/${args.repo}/pulls?${params}`, { allow404: true })

  if (!prs) return []

  const filtered = args.author
    ? prs.filter((p) => p.user.login.toLowerCase() === args.author!.toLowerCase())
    : prs

  return filtered.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft,
    authorLogin: p.user.login,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    mergedAt: p.merged_at,
    reviewers: p.requested_reviewers.map((r) => r.login),
    labels: p.labels.map((l) => l.name),
    url: p.html_url,
  }))
}

// ─── Tool: list_issues ───────────────────────────────────────────────────────

export interface ListIssuesArgs {
  repo: string
  state?: 'open' | 'closed' | 'all'
  /** GitHub username */
  assignee?: string
  limit?: number
}

export async function listIssues(args: ListIssuesArgs) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const params = new URLSearchParams({
    state: args.state ?? 'open',
    sort: 'updated',
    direction: 'desc',
    per_page: String(limit),
  })
  if (args.assignee) params.set('assignee', args.assignee)

  const issues = await gh<Array<{
    number: number
    title: string
    state: string
    html_url: string
    user: { login: string }
    assignee: { login: string } | null
    labels: Array<{ name: string }>
    created_at: string
    updated_at: string
    pull_request?: unknown  // PRs come back from issues endpoint too
  }>>(`/repos/${org()}/${args.repo}/issues?${params}`, { allow404: true })

  if (!issues) return []

  return issues
    .filter((i) => !i.pull_request)  // exclude PRs (they show up in issues API)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      authorLogin: i.user.login,
      assigneeLogin: i.assignee?.login ?? null,
      labels: i.labels.map((l) => l.name),
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      url: i.html_url,
    }))
}

// ─── Tool: get_github_user_activity ──────────────────────────────────────────
// The "killer" tool — what's a person been doing across the org.

export interface UserActivityArgs {
  username: string
  /** Days back to look. Default 7. */
  days?: number
}

export async function getGithubUserActivity(args: UserActivityArgs) {
  const days = Math.min(Math.max(args.days ?? 7, 1), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // We use the search API to span all repos in the org efficiently
  const [commitsRes, prsRes, issuesRes] = await Promise.all([
    gh<{
      total_count: number
      items: Array<{
        sha: string
        repository: { name: string; full_name: string }
        commit: { message: string; author: { date: string } }
        html_url: string
      }>
    }>(
      `/search/commits?q=${encodeURIComponent(`org:${org()} author:${args.username} author-date:>=${since.slice(0, 10)}`)}&per_page=30&sort=author-date`,
      { headers: { Accept: 'application/vnd.github.cloak-preview+json' } as Record<string, string>, allow404: true },
    ).catch(() => ({ total_count: 0, items: [] })),
    gh<{
      total_count: number
      items: Array<{
        number: number
        title: string
        state: string
        repository_url: string
        html_url: string
        created_at: string
        pull_request: unknown
      }>
    }>(
      `/search/issues?q=${encodeURIComponent(`org:${org()} type:pr author:${args.username} created:>=${since.slice(0, 10)}`)}&per_page=20&sort=updated`,
      { allow404: true },
    ).catch(() => ({ total_count: 0, items: [] })),
    gh<{
      total_count: number
      items: Array<{
        number: number
        title: string
        state: string
        repository_url: string
        html_url: string
        created_at: string
        pull_request?: unknown
      }>
    }>(
      `/search/issues?q=${encodeURIComponent(`org:${org()} type:issue author:${args.username} created:>=${since.slice(0, 10)}`)}&per_page=20&sort=updated`,
      { allow404: true },
    ).catch(() => ({ total_count: 0, items: [] })),
  ])

  return {
    username: args.username,
    daysScanned: days,
    since,
    commits: commitsRes.items.map((c) => ({
      repo: c.repository.full_name,
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      date: c.commit.author.date,
      url: c.html_url,
    })),
    pullRequests: prsRes.items.map((p) => ({
      repo: p.repository_url.split('/').slice(-2).join('/'),
      number: p.number,
      title: p.title,
      state: p.state,
      createdAt: p.created_at,
      url: p.html_url,
    })),
    issues: issuesRes.items
      .filter((i) => !i.pull_request)
      .map((i) => ({
        repo: i.repository_url.split('/').slice(-2).join('/'),
        number: i.number,
        title: i.title,
        state: i.state,
        createdAt: i.created_at,
        url: i.html_url,
      })),
    totals: {
      commits: commitsRes.total_count,
      pullRequests: prsRes.total_count,
      issues: issuesRes.total_count - (issuesRes.items.filter((i) => i.pull_request).length),
    },
  }
}

// ─── Tool: search_code ───────────────────────────────────────────────────────

export interface SearchCodeArgs {
  /** What to search for inside files */
  query: string
  /** Limit to one specific repo (org-scoped if omitted) */
  repo?: string
  /** Filter by language (e.g. "typescript", "python") */
  language?: string
  /** Filter by file extension (e.g. "md", "py") — alternative to language */
  extension?: string
  limit?: number
}

export async function searchCode(args: SearchCodeArgs) {
  const parts: string[] = [args.query]
  if (args.repo) parts.push(`repo:${org()}/${args.repo}`)
  else parts.push(`org:${org()}`)
  if (args.language) parts.push(`language:${args.language}`)
  if (args.extension) parts.push(`extension:${args.extension}`)

  const limit = Math.min(Math.max(args.limit ?? 15, 1), 50)
  const params = new URLSearchParams({ q: parts.join(' '), per_page: String(limit) })

  const result = await gh<{
    total_count: number
    items: Array<{
      name: string
      path: string
      repository: { name: string; full_name: string }
      html_url: string
    }>
  }>(`/search/code?${params}`, { allow404: true }).catch(() => ({ total_count: 0, items: [] }))

  return {
    query: args.query,
    totalMatches: result.total_count,
    results: result.items.map((r) => ({
      file: r.name,
      path: r.path,
      repo: r.repository.full_name,
      url: r.html_url,
    })),
  }
}

// ─── Tool: get_file_contents ─────────────────────────────────────────────────

export interface GetFileContentsArgs {
  repo: string
  path: string
  branch?: string
}

export async function getFileContents(args: GetFileContentsArgs) {
  const params = new URLSearchParams()
  if (args.branch) params.set('ref', args.branch)
  const qs = params.toString() ? `?${params}` : ''

  const file = await gh<{
    name: string
    path: string
    type: 'file' | 'dir'
    content?: string  // base64
    encoding?: string
    size: number
    html_url: string
  } | Array<{ name: string; type: string; path: string }>>(
    `/repos/${org()}/${args.repo}/contents/${args.path}${qs}`,
    { allow404: true },
  )

  if (!file) return null
  if (Array.isArray(file)) {
    // It's a directory listing
    return {
      type: 'directory',
      entries: file.map((e) => ({ name: e.name, type: e.type, path: e.path })),
    }
  }
  if (file.type === 'dir') {
    return { type: 'directory', entries: [] }
  }

  let content: string | null = null
  if (file.content && file.encoding === 'base64') {
    // Decode if it's a reasonable text size (< 100 KB)
    if (file.size < 100_000) {
      content = Buffer.from(file.content, 'base64').toString('utf-8')
    }
  }

  return {
    type: 'file',
    name: file.name,
    path: file.path,
    size: file.size,
    content,
    url: file.html_url,
    truncated: file.size >= 100_000,
  }
}

// ─── Write: createRepo ───────────────────────────────────────────────────────

export interface CreateRepoArgs {
  name: string
  description?: string
  private?: boolean
  autoInit?: boolean
}

export async function createRepo(args: CreateRepoArgs) {
  // Sanitize name — GitHub repo names: lowercase, hyphens, no spaces
  const name = args.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (name.length === 0) throw new Error('Invalid repo name')
  if (name.length > 100) throw new Error('Repo name too long (max 100)')

  const body = JSON.stringify({
    name,
    description: args.description?.trim() ?? '',
    private: args.private ?? true,
    auto_init: args.autoInit ?? true,
  })

  const repo = await gh<{
    name: string
    full_name: string
    html_url: string
    private: boolean
    default_branch: string
  }>(`/orgs/${org()}/repos`, { method: 'POST', body })

  return {
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }
}

// ─── Write: createIssue ──────────────────────────────────────────────────────

export interface CreateIssueArgs {
  repo: string
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
}

export async function createIssue(args: CreateIssueArgs) {
  if (args.title.trim().length < 3) throw new Error('Issue title must be at least 3 characters')

  const body = JSON.stringify({
    title: args.title.trim(),
    ...(args.body && { body: args.body.trim() }),
    ...(args.labels?.length && { labels: args.labels }),
    ...(args.assignees?.length && { assignees: args.assignees }),
  })

  const issue = await gh<{
    number: number
    title: string
    html_url: string
    state: string
  }>(`/repos/${org()}/${args.repo}/issues`, { method: 'POST', body })

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
  }
}
