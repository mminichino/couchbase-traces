import express from 'express';

import * as named from './routers/api/named';
import routers from './routers/api';
import clickhouseProxyRouter from './routers/api/clickhouseProxy';
import sourcesRouter from './routers/api/sources';
import externalRoutersV2 from './routers/external-api/v2';

const app = express();
const isUserAuthenticated = (_req: unknown, _res: unknown, next: () => void) => next();

app.use(express.json());
app.use('/static', express.static('public'));
app.use('/team', isUserAuthenticated, routers.teamRouter);
app.use('/me', isUserAuthenticated, named.meRouter);
app.use('/sources', isUserAuthenticated, sourcesRouter);
app.use('/clickhouse-proxy', isUserAuthenticated, clickhouseProxyRouter);
app.use('/api/v2', externalRoutersV2);

export default app;
