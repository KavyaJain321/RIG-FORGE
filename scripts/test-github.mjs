/**
 * Per-tool smoke test for the GitHub integration.
 * Doesn't create or modify anything — only read tools are exercised
 * here. Write tools are tested separately because they have side effects.
 */

import {
  isGithubEnabled,
  listRepos,
  getRepo,
  listCommits,
  listPullRequests,
  listIssues,
  getGithubUserActivity,
  searchCode,
  getFileContents,
} from '../lib/assistant/tools/github.ts'

if (!isGithubEnabled()) {
  console.error('GitHub is not configured (GITHUB_TOKEN + GITHUB_ORG missing).')
  process.exit(1)
}

console.log('=== GitHub read tools probe ===\n')

// 1. List repos
console.log('1. listRepos (top 10, sorted by recent push)')
try {
  const repos = await listRepos({ limit: 10 })
  console.log(`   ✓ ${repos.length} repos found`)
  if (repos.length > 0) {
    for (const r of repos.slice(0, 5)) {
      console.log(`     - ${r.name.padEnd(30)} ${r.language ?? '—'.padEnd(12)} pushed ${r.pushedAt.slice(0, 10)} ${r.private ? '(private)' : '(public)'}`)
    }
    if (repos.length > 5) console.log(`     ... and ${repos.length - 5} more`)
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

// 2. Get one repo's full detail (use the first repo from listRepos)
console.log('\n2. getRepo (first repo from above)')
try {
  const repos = await listRepos({ limit: 1 })
  if (repos.length === 0) {
    console.log('   (skipped — no repos in org)')
  } else {
    const r = await getRepo(repos[0].name)
    if (r) {
      console.log(`   ✓ ${r.fullName}`)
      console.log(`     description: ${r.description ?? '—'}`)
      console.log(`     language:    ${r.language ?? '—'}`)
      console.log(`     default:     ${r.defaultBranch}`)
      console.log(`     topics:      ${r.topics.join(', ') || '—'}`)
    } else {
      console.log('   ✗ getRepo returned null')
    }
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

// 3. List commits on the first repo
console.log('\n3. listCommits (first repo, last 5 commits)')
try {
  const repos = await listRepos({ limit: 1 })
  if (repos.length === 0) {
    console.log('   (skipped — no repos)')
  } else {
    const commits = await listCommits({ repo: repos[0].name, limit: 5 })
    console.log(`   ✓ ${commits.length} commits`)
    for (const c of commits.slice(0, 3)) {
      console.log(`     - ${c.sha} ${c.date.slice(0, 10)} ${c.authorLogin ?? c.authorName}: ${c.message.slice(0, 60)}`)
    }
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

// 4. List open PRs across repos (probe all repos for PR activity)
console.log('\n4. listPullRequests (first repo, open PRs)')
try {
  const repos = await listRepos({ limit: 1 })
  if (repos.length === 0) {
    console.log('   (skipped)')
  } else {
    const prs = await listPullRequests({ repo: repos[0].name, state: 'open', limit: 10 })
    console.log(`   ✓ ${prs.length} open PRs in ${repos[0].name}`)
    for (const p of prs.slice(0, 3)) {
      console.log(`     - #${p.number} "${p.title.slice(0, 60)}" by ${p.authorLogin}`)
    }
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

// 5. List open issues
console.log('\n5. listIssues (first repo, open issues)')
try {
  const repos = await listRepos({ limit: 1 })
  if (repos.length === 0) {
    console.log('   (skipped)')
  } else {
    const issues = await listIssues({ repo: repos[0].name, state: 'open', limit: 10 })
    console.log(`   ✓ ${issues.length} open issues in ${repos[0].name}`)
    for (const i of issues.slice(0, 3)) {
      console.log(`     - #${i.number} "${i.title.slice(0, 60)}" by ${i.authorLogin}`)
    }
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

// 6. User activity for the token owner (KavyaJain321)
console.log('\n6. getGithubUserActivity (KavyaJain321, last 30 days)')
try {
  const activity = await getGithubUserActivity({ username: 'KavyaJain321', days: 30 })
  console.log(`   ✓ since ${activity.since.slice(0, 10)}`)
  console.log(`     commits:        ${activity.totals.commits}`)
  console.log(`     pull requests:  ${activity.totals.pullRequests}`)
  console.log(`     issues opened:  ${activity.totals.issues}`)
  if (activity.commits.length > 0) {
    console.log(`   recent commits:`)
    for (const c of activity.commits.slice(0, 3)) {
      console.log(`     - ${c.repo} ${c.sha}: ${c.message.slice(0, 60)}`)
    }
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

// 7. Code search
console.log('\n7. searchCode (search "README" across org)')
try {
  const result = await searchCode({ query: 'README', limit: 5 })
  console.log(`   ✓ ${result.totalMatches} total matches, returned ${result.results.length}`)
  for (const r of result.results.slice(0, 3)) {
    console.log(`     - ${r.repo}/${r.path}`)
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

// 8. Get file contents — try README from first repo
console.log('\n8. getFileContents (README.md from first repo)')
try {
  const repos = await listRepos({ limit: 1 })
  if (repos.length === 0) {
    console.log('   (skipped)')
  } else {
    const file = await getFileContents({ repo: repos[0].name, path: 'README.md' })
    if (!file) {
      console.log(`   (no README.md in ${repos[0].name})`)
    } else if (file.type === 'directory') {
      console.log(`   got directory listing instead`)
    } else {
      const preview = file.content?.split('\n').slice(0, 3).join(' / ') ?? ''
      console.log(`   ✓ ${file.path} (${file.size} bytes)`)
      console.log(`     preview: ${preview.slice(0, 120)}${preview.length > 120 ? '...' : ''}`)
    }
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e.message?.slice(0, 200)}`)
}

console.log('\n=== Done. All 8 read tools probed. ===')
