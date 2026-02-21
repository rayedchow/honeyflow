export type ProjectType = "paper" | "repo" | "package";

export interface GraphNode {
  id: string;
  type: "REPO" | "PACKAGE" | "BODY_OF_WORK" | "CONTRIBUTOR" | "PAPER" | "CITED_WORK" | "AUTHOR";
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Contributor {
  name: string;
  percentage: string;
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  category: string;
  type: ProjectType;
  summary: string;
  description: string;
  source_url: string;
  raised: number;
  contributors: number;
  depth: number;
  graph_data: GraphData;
  attribution: Record<string, number>;
  dependencies: string[];
  top_contributors: Contributor[];
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  projects: Project[];
  count: number;
}

export interface JuryPeer {
  name: string;
  ai_pct: number;
  detail: string;
  is_subject: boolean;
}

export interface JuryCodeSample {
  filename: string;
  patch: string;
  commit_message: string;
  commit_url: string;
}

export interface JuryLink {
  label: string;
  url: string;
}

export interface JuryEdgeRef {
  source_id: string;
  target_id: string;
  ai_weight: number;
  ai_percentage: number;
  question_type: string;
}

export interface JuryQuestion {
  question_id: string;
  prompt: string;

  project_name: string;
  project_id: number;
  project_slug: string;
  project_description: string;
  project_url?: string;

  subject_name: string;
  subject_summary: string;

  peers: JuryPeer[];
  total_peers: number;

  links: JuryLink[];
  code_samples: JuryCodeSample[];

  edge: JuryEdgeRef;
}

export interface SubmitJuryAnswer {
  question_id?: string;
  project_id: number;
  edge_source: string;
  edge_target: string;
  human_percentage: number;
  confidence: number;
}

export interface SubmitJuryAnswersResponse {
  accepted: number;
  updated_projects: number;
  reward_eth: number;
}

export interface UserProjectContribution {
  slug: string;
  name: string;
  type: ProjectType;
  category: string;
  summary: string;
  source_url: string;
  raised_usd: number;
  raised_eth: number;
  percentage: number;
  share_usd: number;
  share_eth: number;
  contributors: number;
}

export type BadgeCategory = "contributor" | "philanthropist" | "juror" | "community";

export interface BadgeInfo {
  key: string;
  name: string;
  category: BadgeCategory;
  description: string;
  tier: number;
  earned: boolean;
}

export interface UserProfile {
  username: string;
  projects: UserProjectContribution[];
  total_projects: number;
  total_attributed_usd: number;
  total_attributed_eth: number;
  badges: BadgeInfo[];
}

export interface Donation {
  id: number;
  project_id: string;
  donator_address: string;
  amount_eth: number;
  tx_hash: string | null;
  created_at: string;
}

export interface DonationsResponse {
  donations: Donation[];
  total_eth: number;
  count: number;
}
