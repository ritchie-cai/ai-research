// platform-compile-dispatcher.js
// 平台侧编译任务调度层
// 维护编译实例池状态，按芯片平台路由任务，Redis 做分布式锁

import express from 'express';
import { createClient } from 'redis';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
app.use(express.json({ limit: '10mb' }));

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const s3 = new S3Client({ region: process.env.AWS_REGION });
const ARTIFACT_BUCKET = process.env.ARTIFACT_BUCKET;

// ─── 实例池配置（早期固定配置，后期可从配置中心读取） ─────────
// docker-compose 内网 hostname 直接可达
const POOL = {
  'esp32': [
    'http://compiler-esp32-1:8080',
    'http://compiler-esp32-2:8080',
  ],
  'stm32': [
    'http://compiler-stm32-1:8080',
  ],
  'riscv': [
    'http://compiler-riscv-1:8080',
  ],
};

// ─── 提交编译任务 ────────────────────────────────────────────
app.post('/compile', async (req, res) => {
  const { tenant_id, chip_platform, repo_url, commit_sha, build_config } = req.body;

  if (!POOL[chip_platform]) {
    return res.status(400).json({ error: `不支持的芯片平台: ${chip_platform}` });
  }

  const task_id = `${tenant_id}-${Date.now()}`;

  // 向 Git 服务申请短期只读 token（接入你们的 Git 服务）
  const git_token = await issueShortLivedToken(tenant_id, repo_url);

  // 取空闲实例
  const endpoint = await acquire(chip_platform, task_id);
  if (!endpoint) {
    return res.status(503).json({
      error: '编译资源繁忙，请稍后重试',
      retry_after: 30,
    });
  }

  console.log(`[dispatcher] task=${task_id} → ${endpoint}`);

  try {
    const result = await fetch(`${endpoint}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id,
        tenant_id,
        git_token,   // 短期 token，编译沙箱用完即失效
        repo_url,
        commit_sha,
        build_config,
      }),
      signal: AbortSignal.timeout(150_000), // 150s 超时
    }).then(r => r.json());

    if (!result.ok) {
      return res.status(500).json({ error: result.error, stderr: result.stderr });
    }

    // 产物由调度层写入，编译沙箱不直接接触云存
    const download_url = await saveArtifact(tenant_id, task_id, result.firmware, result.filename);

    res.json({ ok: true, task_id, download_url });

  } catch (err) {
    console.error(`[dispatcher] task=${task_id} error:`, err.message);
    res.status(500).json({ error: err.message });

  } finally {
    await release(chip_platform, endpoint);
  }
});

// ─── 实例池：获取空闲实例 ────────────────────────────────────
async function acquire(platform, task_id) {
  for (const endpoint of POOL[platform]) {
    // SETNX 原子抢占，EX=180 防止死锁
    const ok = await redis.set(
      `compiler:lock:${endpoint}`,
      task_id,
      { NX: true, EX: 180 }
    );
    if (ok) return endpoint;
  }
  return null; // 全部繁忙
}

// ─── 实例池：释放实例 ────────────────────────────────────────
async function release(platform, endpoint) {
  await redis.del(`compiler:lock:${endpoint}`);
  console.log(`[dispatcher] released: ${endpoint}`);
}

// ─── 产物存储（租户隔离路径） ────────────────────────────────
async function saveArtifact(tenant_id, task_id, firmware_base64, filename) {
  const key = `tenants/${tenant_id}/tasks/${task_id}/${filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: ARTIFACT_BUCKET,
    Key: key,
    Body: Buffer.from(firmware_base64, 'base64'),
    Metadata: { tenant_id, task_id },
  }));

  // 限时下载链接，只给发起请求的租户（1小时有效）
  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: ARTIFACT_BUCKET,
    Key: key,
  }), { expiresIn: 3600 });

  return url;
}

// ─── 查询实例池状态（运维用） ────────────────────────────────
app.get('/pool/status', async (req, res) => {
  const status = {};
  for (const [platform, instances] of Object.entries(POOL)) {
    status[platform] = await Promise.all(instances.map(async (endpoint) => {
      const lock = await redis.get(`compiler:lock:${endpoint}`);
      return { endpoint, busy: !!lock, task_id: lock };
    }));
  }
  res.json(status);
});

async function issueShortLivedToken(tenant_id, repo_url) {
  // 接入你们的 Git 服务（GitHub App / GitLab / 自建）
  // 返回只读、TTL=15min、只限该 repo 的 token
  return process.env.GIT_TOKEN_PLACEHOLDER;
}

app.listen(3003, () => console.log('[dispatcher] listening on :3003'));
