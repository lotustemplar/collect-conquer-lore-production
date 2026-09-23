import { defineConfig } from 'vite';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').at(-1);
const isGitHubPagesBuild = Boolean(process.env.GITHUB_ACTIONS && repositoryName);

export default defineConfig({
  base: isGitHubPagesBuild ? `/${repositoryName}/` : '/',
});
