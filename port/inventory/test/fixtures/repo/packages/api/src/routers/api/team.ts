import express from 'express';

const router = express.Router();

router.get('/members', (_req, res) => {
  res.json([]);
});

export default router;
