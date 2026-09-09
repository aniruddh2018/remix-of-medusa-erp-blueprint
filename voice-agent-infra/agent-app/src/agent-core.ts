// HTTP entrypoint AgentCore Runtime calls into.
// https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html
// Adapted from the reference implementation's agent-core.ts.
import express from 'express';
import { z } from 'zod';
import { main } from './agent.js';

let currentStatus: 'busy' | 'idle' = 'idle';
const app = express();
app.use(express.json());

const bodySchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  voiceId: z.string().default('matthew'),
});

app.post('/invocations', async (req, res) => {
  const body = bodySchema.parse(req.body);
  console.log(body);

  currentStatus = 'busy';
  main(body.sessionId, body.userId, body.voiceId)
    .catch((e) => console.log(e))
    .finally(() => {
      currentStatus = 'idle';
    });

  res.json({ response: 'ok', status: 'success' });
});

app.get('/ping', (_req, res) => {
  res.json({ status: currentStatus === 'idle' ? 'Healthy' : 'HealthyBusy', time_of_last_update: Math.floor(Date.now() / 1000) });
});

// AgentCore Runtime requires port 8080 in production; PORT override is only
// for local smoke-testing.
const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`Agent server listening on 0.0.0.0:${port}`);
});
