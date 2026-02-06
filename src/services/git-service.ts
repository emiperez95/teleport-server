import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

const PROJECTS_DIR = process.env.PROJECTS_DIR || '/projects';

export class GitService {
  /**
   * Clone a repository or pull if it already exists
   * Returns the working directory path
   */
  async cloneOrPull(repoUrl: string, branch?: string): Promise<string> {
    const projectName = this.extractProjectName(repoUrl);
    const workDir = path.join(PROJECTS_DIR, projectName);

    if (existsSync(workDir)) {
      logger.info(`Repository exists, pulling latest for ${projectName}`);
      await this.pull(workDir, branch);
    } else {
      logger.info(`Cloning ${repoUrl} to ${workDir}`);
      await this.clone(repoUrl, workDir, branch);
    }

    return workDir;
  }

  /**
   * Clone a repository
   */
  async clone(repoUrl: string, workDir: string, branch?: string): Promise<void> {
    // Ensure parent directory exists
    const parentDir = path.dirname(workDir);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const branchArg = branch ? `-b ${branch}` : '';
    const cmd = `git clone ${branchArg} "${repoUrl}" "${workDir}"`;

    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
      if (stderr && !stderr.includes('Cloning into')) {
        logger.warn(`Git clone warning: ${stderr}`);
      }
      logger.info(`Clone complete: ${stdout || 'success'}`);
    } catch (error) {
      logger.error(`Git clone failed: ${error}`);
      throw new Error(`Failed to clone repository: ${error}`);
    }
  }

  /**
   * Pull latest changes
   */
  async pull(workDir: string, branch?: string): Promise<void> {
    try {
      // Fetch first
      await execAsync('git fetch --all', { cwd: workDir, timeout: 60000 });

      // Checkout branch if specified
      if (branch) {
        await execAsync(`git checkout ${branch}`, { cwd: workDir, timeout: 30000 });
      }

      // Pull
      const { stdout, stderr } = await execAsync('git pull', {
        cwd: workDir,
        timeout: 60000,
      });

      if (stderr && !stderr.includes('Already up to date')) {
        logger.warn(`Git pull warning: ${stderr}`);
      }
      logger.info(`Pull complete: ${stdout || 'up to date'}`);
    } catch (error) {
      logger.error(`Git pull failed: ${error}`);
      throw new Error(`Failed to pull repository: ${error}`);
    }
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(
    workDir: string,
    message: string,
    remote = 'origin'
  ): Promise<{ committed: boolean; pushed: boolean }> {
    const result = { committed: false, pushed: false };

    try {
      // Check for changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
      });

      if (!status.trim()) {
        logger.info('No changes to commit');
        return result;
      }

      // Stage all changes
      await execAsync('git add -A', { cwd: workDir });

      // Commit
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: workDir,
      });
      result.committed = true;
      logger.info('Changes committed');

      // Push
      const { stdout: branch } = await execAsync('git branch --show-current', {
        cwd: workDir,
      });
      await execAsync(`git push ${remote} ${branch.trim()}`, {
        cwd: workDir,
        timeout: 60000,
      });
      result.pushed = true;
      logger.info('Changes pushed');
    } catch (error) {
      logger.error(`Git commit/push failed: ${error}`);
    }

    return result;
  }

  /**
   * Extract project name from git URL
   */
  private extractProjectName(repoUrl: string): string {
    // Handle various git URL formats:
    // https://github.com/user/repo.git
    // git@github.com:user/repo.git
    // https://github.com/user/repo

    let name = repoUrl
      .replace(/\.git$/, '')
      .split('/')
      .pop() || 'unknown';

    // If URL has org/repo format, include org for uniqueness
    const parts = repoUrl
      .replace(/\.git$/, '')
      .replace(/^.*[/:]([\w-]+)\/([\w-]+)$/, '$1/$2')
      .split('/');

    if (parts.length >= 2) {
      name = `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
    }

    return name;
  }
}

export const gitService = new GitService();
