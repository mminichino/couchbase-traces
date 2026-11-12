import express from 'express';

const router = express.Router();

router.get('/orphan', (_req, res) => {
  res.json({});
});

export default router;
