import express from 'express';

const router = express.Router();

router.all('/*', (_req, res) => {
  res.json({});
});

export default router;
