import express from 'express';

const router = express.Router();
const handler = (_req: unknown, res: { json(v: unknown): void }) => res.json([]);

router.get('/', handler);
router.route('/items').get(handler).post(handler);

export default router;
