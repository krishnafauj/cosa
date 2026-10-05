// Shapes returned by the Django API (see backend serializers.py files).

export type UserType = "STUDENT" | "COSA" | "FACULTY" | "ADMIN";
export type CosaLevel = "GEN_SEC" | "PRESIDENT" | "SECRETARY" | null;

export type Branch = "CSE" | "MNC" | "AIDS";

export const BRANCHES: { value: Branch; label: string }[] = [
  { value: "CSE", label: "Computer Science and Engineering" },
  { value: "MNC", label: "Mathematics and Computing" },
  { value: "AIDS", label: "Artificial Intelligence and Data Science" },
];

export interface Me {
  id: number;
  email: string;
  full_name: string;
  avatar_url: string;
  roll_number: string;
  branch: Branch | "";
  branch_label: string;
  batch_year: number | null;
  semester: number | null;
  year_of_study: number | null;
  about: string;
  profile_complete: boolean;
  has_photo: boolean;
  user_type: UserType;
  is_cosa: boolean;
  cosa_level: CosaLevel;
  role_name: string | null;
  owned_category: { id: number; name: string } | null;
  can_manage_issues: boolean;
  can_raise_issues: boolean;
}

export interface UserBrief {
  id: number;
  full_name: string;
  email: string | null;
  user_type: UserType;
  role_name: string | null;
  avatar_url: string;
  roll_number?: string;
  branch?: Branch | "";
  year_of_study?: number | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export type IssueStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface IssueCard {
  id: number;
  title: string;
  category: Category;
  priority: Priority;
  status: IssueStatus;
  status_label: string;
  created_by: UserBrief;
  assignees: UserBrief[];
  is_escalated: boolean;
  reopened_count: number;
  upvote_count: number;
  my_support: "PUBLIC" | "PRIVATE" | null;
  created_at: string;
  updated_at: string;
}

export interface MyIssue extends IssueCard {
  can_escalate: boolean;
  can_reopen: boolean;
  escalation_available_at: string;
  completed_at: string | null;
}

export interface Attachment {
  id: number;
  url: string;
  original_name: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface IssueDetail extends IssueCard {
  description: string;
  tagged_members: UserBrief[];
  faculty: UserBrief | null;
  escalated_at: string | null;
  resolution: string;
  completed_at: string | null;
  last_reopened_at: string | null;
  attachments: Attachment[];
  has_upvoted: boolean;
  escalation_available_at: string;
  permissions: {
    can_edit: boolean;
    can_assign: boolean;
    can_post_update: boolean;
    can_remark: boolean;
    can_escalate: boolean;
    can_reopen: boolean;
    can_upvote: boolean;
    can_export: boolean;
  };
}

export interface LatestNote {
  body: string;
  author: string;
  created_at: string;
  type?: "REMARK" | "REOPEN" | "ESCALATION";
}

export interface IssueRow extends IssueCard {
  tagged_members: UserBrief[];
  faculty: UserBrief | null;
  last_update: LatestNote | null;
  last_remark: LatestNote | null;
}

export interface BoardColumn {
  status: IssueStatus;
  label: string;
  count: number;
  issues: IssueCard[];
}

export interface IssueUpdate {
  id: number;
  author: UserBrief;
  body: string;
  status_to: IssueStatus | "";
  attachments: Attachment[];
  created_at: string;
  edited_at: string | null;
}

export interface Remark {
  id: number;
  author: UserBrief;
  type: "REMARK" | "REOPEN" | "ESCALATION";
  body: string;
  attachments: Attachment[];
  created_at: string;
  edited_at: string | null;
}

export type TimelineItem =
  | { kind: "update"; created_at: string; data: IssueUpdate }
  | { kind: "remark"; created_at: string; data: Remark };

export interface IssueEvent {
  id: number;
  actor: UserBrief | null;
  actor_role: string;
  action: string;
  field: string;
  old_value: string;
  new_value: string;
  created_at: string;
}

export interface Club {
  id: number;
  name: string;
  slug: string;
  kind: string;
  description: string;
  logo: string | null;
  contact_email: string;
  secretary_role: number | null;
  secretary_role_name: string | null;
  is_active: boolean;
  member_count: number;
  upcoming_event_count: number;
  memberships?: { id: number; user: UserBrief; position: string; joined_at: string }[];
}

export interface CampusEvent {
  id: number;
  title: string;
  club: number | null;
  club_name: string | null;
  organising_body: string;
  description: string;
  venue: string;
  starts_at: string;
  ends_at: string | null;
  poster: string | null;
  registration_url: string;
  status: "SCHEDULED" | "CANCELLED";
  phase: "UPCOMING" | "ONGOING" | "COMPLETED" | "CANCELLED";
  created_by: UserBrief;
  can_edit: boolean;
}

export interface Committee {
  id: number;
  name: string;
  purpose: string;
  event: number | null;
  event_title: string | null;
  issue: number | null;
  issue_title: string | null;
  formed_on: string;
  applications_open_until: string | null;
  applications_open: boolean;
  is_active: boolean;
  members: { id: number; user: UserBrief; position: string; added_at: string }[];
  created_by: UserBrief;
  my_application_status: "PENDING" | "ACCEPTED" | "REJECTED" | null;
}

export interface CommitteeApplication {
  id: number;
  committee: number;
  committee_name: string;
  applicant: UserBrief;
  statement: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  reviewed_at: string | null;
  created_at: string;
}

export interface CosaPost {
  id: number;
  title: string;
  body: string;
  category: number | null;
  category_name: string | null;
  attachment: string | null;
  linked_issues: number[];
  author: UserBrief;
  author_role: string;
  is_pinned: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface RoleMailbox {
  id: number;
  email: string;
  role_name: string;
  level: "GEN_SEC" | "PRESIDENT" | "SECRETARY";
  category: number | null;
  category_name: string | null;
  held_by_name: string;
  academic_year: string;
  user_id: number | null;
}

export interface Notification {
  id: number;
  kind: string;
  title: string;
  message: string;
  actor_name: string | null;
  target_type: string;
  target_id: number | null;
  is_read: boolean;
  created_at: string;
}

export interface Dashboard {
  open_total: number;
  by_status: Partial<Record<IssueStatus, number>>;
  unassigned: number;
  assigned_to_me: number;
  my_category: number | null;
  escalated: number;
  overdue: number;
  by_category: { category__name: string; n: number }[];
}

export interface Supporter {
  id: number;
  full_name: string;
  roll_number: string;
  branch: Branch | "";
  year_of_study: number | null;
  avatar_url: string;
  role: "RAISED" | "SUPPORTER";
  is_private: boolean;
  joined_at: string;
}

export interface SupportersResponse {
  total: number;
  private_hidden: number;
  next: number | null;
  previous: number | null;
  results: Supporter[];
}
