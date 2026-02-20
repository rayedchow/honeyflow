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
