// compiler-worker.js
// 编译沙箱内运行的 HTTP worker
// 每个芯片平台一个镜像，单实例单任务，无状态

import express from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
app.use(express.json({ limit: '50mb' }));

const INSTANCE_ID = process.env.INSTANCE_ID || 'unknown';

// 单任务锁：同一实例不并发处理多个任务
let busy = false;

// ─── 健康检查（调度层用于探活） ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, instance: INSTANCE_ID, busy });
});

// ─── 编译任务入口 ────────────────────────────────────────────
app.post('/compile', async (req, res) => {
  if (busy) {
    // 实例繁忙，调度层会重新分配其他实例
    return res.status(503).json({ error: 'instance busy', instance: INSTANCE_ID });
  }
  busy = true;

  const { task_id, tenant_id, git_token, repo_url, commit_sha, build_config } = req.body;

  // 每个任务独立临时目录，用 task_id 命名（不用 tenant_id 防止信息泄露）
  const workdir = path.join(os.tmpdir(), `task-${task_id}`);

  console.log(`[compiler] start task=${task_id} tenant=${tenant_id}`);

  try {
    fs.mkdirSync(workdir, { mode: 0o700, recursive: true });

    // 1. 用短期 token 拉取源码，token 注入 clone URL 不出现在日志
    const authUrl = repo_url.replace('https://', `https://x-access-token:${git_token}@`);
    execSync(
      `git clone --depth=1 ${authUrl} ${workdir}/src`,
      {
        env: {
          HOME: workdir,
          GIT_TERMINAL_PROMPT: '0',
          PATH: process.env.PATH,
        },
        stdio: 'pipe',
        timeout: 60_000,
      }
    );

    // 2. 固定到指定 commit，防止编译期间源码被修改
    execSync(`git -C ${workdir}/src checkout ${commit_sha}`, { stdio: 'pipe' });

    // 3. 执行编译，最小化环境变量，隔离宿主机环境
    execSync(build_config.build_cmd || 'make', {
      cwd: `${workdir}/src`,
      timeout: 120_000,
      env: {
        PATH: '/usr/bin:/bin:/usr/local/bin', // 最小 PATH
        HOME: workdir,                         // 隔离 HOME
        WORKDIR: workdir,
        ...build_config.env_vars,              // 构建需要的额外变量
      },
    });

    // 4. 读取产物
    const outputFile = path.join(workdir, 'src', build_config.output_file);
    if (!fs.existsSync(outputFile)) {
      throw new Error(`产物文件不存在: ${build_config.output_file}`);
    }

    const firmware = fs.readFileSync(outputFile);
    console.log(`[compiler] done task=${task_id} size=${firmware.length}`);

    res.json({
      ok: true,
      firmware: firmware.toString('base64'),
      filename: path.basename(build_config.output_file),
    });

  } catch (err) {
    console.error(`[compiler] failed task=${task_id}`, err.message);
    res.json({
      ok: false,
      error: err.message,
      stderr: err.stderr?.toString().slice(0, 2000), // 截断，防止日志过大
    });

  } finally {
    // 无论成功失败，立即清理临时目录
    fs.rmSync(workdir, { recursive: true, force: true });
    busy = false;
    console.log(`[compiler] cleaned task=${task_id}`);
  }
});

app.listen(8080, () => {
  console.log(`[compiler] instance=${INSTANCE_ID} listening on :8080`);
});
