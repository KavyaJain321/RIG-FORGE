// ─── JWT ─────────────────────────────────────────────────────────────────────

export type AppRole = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'

export interface JWTPayload {
  userId: string
  email: string
  role: AppRole
  isOnboarding: boolean
  mustChangePassword: boolean
  iat?: number
  exp?: number
}

// ─── User ─────────────────────────────────────────────────────────────────────

/**
 * Safe user shape returned from all auth endpoints.
 * passwordHash is NEVER included.
 */
export interface AuthUser {
  id: string
  name: string
  email: string
  role: AppRole
  avatarUrl: string | null
  currentStatus: 'WORKING' | 'NOT_WORKING'
  isOnboarding: boolean
  mustChangePassword: boolean
  createdAt: Date
}

// ─── API Responses ────────────────────────────────────────────────────────────

export type ApiResponse<T> =
  | {
      data: T
      error: null
    }
  | {
      data: null
      error: string
    }

export type ApiError = {
  message: string
  code?: string
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  nextCursor: string | null
  total: number
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectLink {
  label: string
  url: string
}

/** Lightweight project shape for list views. */
export interface ProjectSummary {
  id: string
  name: string
  description: string | null
  status: string
  priority: string
  deadline: Date | null
  leadId: string | null
  leadName: string | null
  links: ProjectLink[]
  totalTasks: number
  doneTasks: number
  memberCount: number
  members: {
    id: string
    name: string
    avatarUrl: string | null
    role: string
  }[]
  createdAt: Date
  updatedAt: Date
}

/** Full project profile for detail views. */
export interface ProjectDetail {
  id: string
  name: string
  description: string | null
  status: string
  priority: string
  deadline: Date | null
  leadId: string | null
  leadName: string | null
  links: ProjectLink[]
  totalTasks: number
  doneTasks: number
  createdAt: Date
  updatedAt: Date
  members: {
    userId: string
    name: string
    email: string
    avatarUrl: string | null
    role: string
    currentStatus: string
    joinedAt: Date
    isLead: boolean
  }[]
  tasks: {
    id: string
    title: string
    description: string | null
    expectedOutput: string | null
    status: string
    priority: string
    assigneeId: string | null
    assigneeName: string | null
    dueDate: Date | null
    completedAt: Date | null
    createdAt: Date
  }[]
}

// ─── Members ──────────────────────────────────────────────────────────────────

/** Lightweight user shape for list views. */
export interface MemberSummary {
  id: string
  name: string
  email: string           // empty string '' when viewer is EMPLOYEE and this is a teammate
  role: AppRole
  avatarUrl: string | null
  currentStatus: 'WORKING' | 'NOT_WORKING'
  lastSeenAt: Date | null // null when viewer is EMPLOYEE and this is a teammate
  isOnboarding: boolean
  projectCount: number    // 0 when viewer is EMPLOYEE and this is a teammate
  primaryProject: string | null  // null when viewer is EMPLOYEE and this is a teammate
  createdAt: Date
  isOwnProfile: boolean   // true when this is the currently-logged-in user's own card
}

/** Full member detail for admin view. */
export interface MemberDetail {
  id: string
  name: string
  email: string
  role: AppRole
  tempPassword?: string | null        // only present for admin/superadmin viewers
  mustChangePassword?: boolean        // only present for admin/superadmin viewers
  avatarUrl: string | null
  currentStatus: 'WORKING' | 'NOT_WORKING'
  lastSeenAt: Date | null
  isOnboarding: boolean
  createdAt: Date
  projects: {
    id: string
    name: string
    status: string
    isLead: boolean
    joinedAt: Date
    myTaskCount: number
    myDoneTaskCount: number
  }[]
  activityThisWeek: {
    date: string
    wasActive: boolean
  }[]
  completedTasksThisWeek: {
    id: string
    title: string
    projectId: string
    projectName: string
    completedAt: Date
  }[]
  inProgressTasks: {
    id: string
    title: string
    priority: string
    projectId: string
    projectName: string
    dueDate: Date | null
    isOverdue: boolean
  }[]
  ticketsRaisedCount: number
  ticketsHelpedCount: number
  dailyLogsThisWeek: {
    date: string
    workSummary: string
    notes: string | null
  }[]
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

/** Lightweight task shape for lists and PATCH responses. */
export interface TaskSummary {
  id: string
  title: string
  description: string | null
  expectedOutput: string | null
  status: string
  priority: string
  projectId: string
  projectName: string
  assigneeId: string | null
  assigneeName: string | null
  assigneeAvatar: string | null
  dueDate: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export interface TicketSummary {
  id: string
  title: string
  description: string
  status: 'OPEN' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
  projectId: string
  projectName: string
  raisedById: string
  raisedByName: string
  raisedByAvatar: string | null
  helperId: string | null
  helperName: string | null
  createdAt: Date
  acceptedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
}

// ─── Daily Log ────────────────────────────────────────────────────────────────

export interface DailyLogEntry {
  id: string
  userId: string
  date: Date
  workSummary: string
  notes: string | null
  isLocked: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── Daily Activity ───────────────────────────────────────────────────────────

export interface DailyActivityRecord {
  id: string
  userId: string
  date: Date
  wasActive: boolean
  lastSeenAt: Date | null
}

// ─── Weekly Report ────────────────────────────────────────────────────────────

export interface WeeklyReportEmployeeSnapshot {
  userId: string
  name: string
  email: string
  role: string
  daysActive: number
  activeDays: string[]
  tasksCompleted: {
    id: string
    title: string
    projectName: string
    completedAt: string
  }[]
  tasksInProgress: {
    id: string
    title: string
    projectName: string
    dueDate: string | null
  }[]
  overdueTasksCount: number
  ticketsRaised: number
  ticketsHelped: number
  dailyLogs: {
    date: string
    workSummary: string
    notes: string | null
  }[]
}

export interface WeeklyReportProjectSnapshot {
  projectId: string
  name: string
  status: string
  leadName: string | null
  memberCount: number
  tasksTotal: number
  tasksCompleted: number
  tasksInProgress: number
  tasksOverdue: number
  completedThisWeek: number
}

export interface WeeklyReportSnapshot {
  weekStart: string
  weekEnd: string
  companyStats: {
    totalEmployees: number
    totalDaysActive: number
    totalTasksCompleted: number
    totalTicketsRaised: number
    totalTicketsResolved: number
    activeProjects: number
  }
  projects: WeeklyReportProjectSnapshot[]
  employees: WeeklyReportEmployeeSnapshot[]
}

export interface WeeklyReportSummary {
  id: string
  weekStart: Date
  weekEnd: Date
  generatedAt: Date
}

// ─── Notifications ─────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  linkTo: string | null
  createdAt: Date
}

// ─── Thread Messages ──────────────────────────────────────────────────────────

export interface MessageResponse {
  id: string
  content: string
  authorId: string
  authorName: string
  authorAvatar: string | null
  authorRole?: string
  threadType: 'task' | 'project'
  threadId: string
  createdAt: Date
  updatedAt: Date
  edited: boolean
  visibility: 'TEAM' | 'LEAD_ADMIN'
  fileUrl?: string | null
  fileName?: string | null
  fileType?: string | null
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface AdminDashboardData {
  memberStats: {
    total: number
    working: number
    notWorking: number
  }
  openTicketsCount: number
  activeProjects: {
    id: string
    name: string
    memberCount: number
    openTaskCount: number
    leadName: string | null
  }[]
  workingMembers: {
    id: string
    name: string
    avatarUrl: string | null
    currentStatus: 'WORKING' | 'NOT_WORKING'
    lastSeenAt: Date | null
    primaryProject: string | null
    primaryProjectId: string | null
  }[]
  recentOpenTickets: {
    id: string
    title: string
    raisedByName: string
    projectName: string
    createdAt: Date
  }[]
  pendingOnboarding: {
    id: string
    name: string
    email: string
    role: string
    createdAt: Date
    hasLoggedIn: boolean
  }[]
}

export interface EmployeeDashboardData {
  myOpenTasksCount: number
  myProjectsCount: number
  myOpenTicketsCount: number
  myProjects: {
    id: string
    name: string
    status: string
    isLead: boolean
    myTaskCount: number
  }[]
  myUpcomingTasks: {
    id: string
    title: string
    status: string
    priority: string
    projectId: string
    projectName: string
    dueDate: Date | null
    isOverdue: boolean
  }[]
  myRecentTickets: {
    id: string
    title: string
    status: string
    projectName: string
    createdAt: Date
  }[]
}

// ─── Onboarding (Admin) ───────────────────────────────────────────────────────

export interface PendingUser {
  id: string
  name: string
  email: string
  role: AppRole
  createdAt: Date
  hasLoggedIn: boolean
  lastSeenAt: Date | null
}

export interface GeneratedCredentials {
  email: string
  temporaryPassword: string
}
