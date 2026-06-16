export interface BuildInfo {
  commit: string;
  commit_short: string;
  branch: string;
  build_date: string | null;
  build_method: string;
  github_url: string;
  commit_url: string | null;
}
