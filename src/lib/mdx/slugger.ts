import GitHubSlugger from 'github-slugger';

export default function createGitHubSlugger() {
  const slugger = new GitHubSlugger();

  return (text: string) => slugger.slug(text);
}
