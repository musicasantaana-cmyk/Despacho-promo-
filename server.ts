import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;
const STORE_PATH = path.join(process.cwd(), 'data_store.json');

app.use(express.json({ limit: '15mb' }));

interface ServerStore {
  version: number;
  lastModified: number;
  data: any;
}

// Initial state
let currentStore: ServerStore = {
  version: 1,
  lastModified: Date.now(),
  data: {
    workGroups: [],
    activeWorkGroupId: null,
    employees: [],
    vehicles: [],
    routes: [],
    assignments: [],
    crews: [],
    backupEmail: null,
    lastBackupDate: null,
  }
};

// Load saved data if exists
try {
  if (fs.existsSync(STORE_PATH)) {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.version === 'number' && parsed.data) {
      currentStore = parsed;
    } else if (parsed && parsed.employees) {
      currentStore.data = parsed;
      currentStore.lastModified = Date.now();
    }
    console.log(`[Store] Loaded persistence data. Version: ${currentStore.version}`);
  }
} catch (err) {
  console.error('[Store] Error loading persistence file:', err);
}

const saveStoreToDisk = () => {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(currentStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Store] Failed to write data_store.json:', err);
  }
};

// --- API Gateway Endpoints ---

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: currentStore.version,
    lastModified: currentStore.lastModified,
    serverTime: Date.now(),
  });
});

// 2. Lightweight Status check (for low-latency 15-second heartbeat poll)
app.get('/api/sync/status', (req, res) => {
  res.json({
    version: currentStore.version,
    lastModified: currentStore.lastModified,
    serverTime: Date.now(),
  });
});

// 3. Full Sync Retrieval
app.get('/api/sync', (req, res) => {
  res.json({
    success: true,
    version: currentStore.version,
    lastModified: currentStore.lastModified,
    state: currentStore.data,
  });
});

// 4. Push Updates from any Client Device
app.post('/api/sync', (req, res) => {
  try {
    const { deviceId, clientVersion, state: incomingState, forceOverride } = req.body;

    if (!incomingState) {
      return res.status(400).json({ error: 'Missing state object' });
    }

    // Update database store
    currentStore.version += 1;
    currentStore.lastModified = Date.now();
    currentStore.data = incomingState;

    saveStoreToDisk();

    console.log(`[Sync Gateway] Sync accepted from device [${deviceId || 'unknown'}]. New Server Version: ${currentStore.version}`);

    res.json({
      success: true,
      version: currentStore.version,
      lastModified: currentStore.lastModified,
      state: currentStore.data,
    });
  } catch (error: any) {
    console.error('[Sync Gateway] Error processing sync:', error);
    res.status(500).json({ error: 'Internal sync error' });
  }
});

// Vite middleware or Static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PROMODESPACHO] Gateway server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
