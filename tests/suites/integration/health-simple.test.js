/**
 * Simple Health Test - Minimal version to verify test infrastructure
 */

import { isServerRunning } from '../../infrastructure/archiServer.js';

const serverAvailable = await isServerRunning();

describe.skipIf(!serverAvailable)('Health Endpoint (Simple)', () => {

  it('returns OK status', async () => {
    const response = await fetch('http://localhost:8765/health');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('server');
    expect(data).toHaveProperty('model');
  });

  it('returns server information', async () => {
    const response = await fetch('http://localhost:8765/health');
    const data = await response.json();

    expect(data.server.port).toBe(8765);
    expect(data.server.host).toBe('127.0.0.1');
    expect(data.server.uptime).toBeGreaterThan(0);
  });

  it('returns model information', async () => {
    const response = await fetch('http://localhost:8765/health');
    const data = await response.json();

    expect(data.model).toHaveProperty('name');
    expect(data.model).toHaveProperty('elements');
    expect(data.model).toHaveProperty('relationships');
    expect(data.model).toHaveProperty('views');
    expect(typeof data.model.elements).toBe('number');
    expect(typeof data.model.relationships).toBe('number');
    expect(typeof data.model.views).toBe('number');
  });
});
