import express from 'express';

import alertsRouter from '@/routers/external-api/v2/alerts';

const router = express.Router();
const limiter = (_req: unknown, _res: unknown, next: () => void) => next();

router.get('/', (_req, res) => {
  res.json({ version: 'v2' });
});

router.use('/alerts', limiter, alertsRouter);

export default router;
